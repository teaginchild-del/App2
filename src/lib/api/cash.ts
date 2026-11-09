import { supabase } from '@/lib/supabase'
import {
  applyPayment,
  assertRefundable,
  customerDepositStatus,
  dateOnly,
  type Application,
  type ReceiptMethod,
} from '@/lib/billing-engine'
import { CUSTOMER_COLUMNS, mapO2cCustomer, rpc, str, type Row } from '@/lib/api/o2c-shared'
import type { CustomerDeposit, CustomerPayment } from '@/types/order-to-cash'

/**
 * Cash application. Customer payments pay invoices that already exist (one
 * payment can be split across several; overpayment stays as unapplied
 * credit). Customer deposits are prepayments taken before an invoice exists
 * — held as a liability and applied automatically when the order is billed.
 * Both wait in undeposited funds until grouped into a bank deposit.
 */

export const RECEIPT_METHODS: Array<{ value: ReceiptMethod; label: string }> = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
  { value: 'wire', label: 'Wire' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'stripe', label: 'Stripe' },
]

export function mapDeposit(row: Row): CustomerDeposit {
  const amount = row.amount_cents as number
  const applied = row.amount_applied_cents as number
  const refunded = row.amount_refunded_cents as number
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    customer: row.customer ? mapO2cCustomer(row.customer as Row) : null,
    salesOrderId: str(row.sales_order_id),
    receivedOn: row.received_on as string,
    amountCents: amount,
    amountAppliedCents: applied,
    amountRefundedCents: refunded,
    method: row.method as ReceiptMethod,
    reference: str(row.reference),
    stripePayoutId: str(row.stripe_payout_id),
    bankDepositId: str(row.bank_deposit_id),
    createdAt: row.created_at as string,
    status: customerDepositStatus(amount, applied, refunded),
    remainingCents: amount - applied - refunded,
  }
}

export function mapPayment(row: Row): CustomerPayment {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    customer: row.customer ? mapO2cCustomer(row.customer as Row) : null,
    receivedOn: row.received_on as string,
    amountCents: row.amount_cents as number,
    unappliedCents: row.unapplied_cents as number,
    method: row.method as ReceiptMethod,
    reference: str(row.reference),
    stripePayoutId: str(row.stripe_payout_id),
    bankDepositId: str(row.bank_deposit_id),
    createdAt: row.created_at as string,
    applications: ((row.payment_applications as Row[]) ?? []).map((a) => ({
      invoiceId: a.invoice_id as string,
      invoiceNumber: str((a.invoice as Row | null)?.invoice_number),
      amountCents: a.amount_cents as number,
    })),
  }
}

export async function listDeposits(filter: { salesOrderId?: string } = {}): Promise<CustomerDeposit[]> {
  let query = supabase
    .from('customer_deposits')
    .select(`*, customer:customers(${CUSTOMER_COLUMNS})`)
    .order('received_on', { ascending: false })
  if (filter.salesOrderId) query = query.eq('sales_order_id', filter.salesOrderId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapDeposit)
}

const PAYMENT_SELECT = `*, customer:customers(${CUSTOMER_COLUMNS}), payment_applications(invoice_id, amount_cents, invoice:invoices(invoice_number))`

export async function getPayment(id: string): Promise<CustomerPayment> {
  const { data, error } = await supabase.from('customer_payments').select(PAYMENT_SELECT).eq('id', id).single()
  if (error) throw error
  return mapPayment(data)
}

export async function getDeposit(id: string): Promise<CustomerDeposit> {
  const { data, error } = await supabase
    .from('customer_deposits')
    .select(`*, customer:customers(${CUSTOMER_COLUMNS})`)
    .eq('id', id)
    .single()
  if (error) throw error
  return mapDeposit(data)
}

export async function listPayments(): Promise<CustomerPayment[]> {
  const { data, error } = await supabase
    .from('customer_payments')
    .select(PAYMENT_SELECT)
    .order('received_on', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPayment)
}

export async function recordCustomerDeposit(input: {
  customerId: string
  salesOrderId?: string | null
  amountCents: number
  method: ReceiptMethod
  receivedOn: string
  reference?: string
  stripePayoutId?: string
}): Promise<void> {
  if (!(input.amountCents > 0)) throw new Error('Deposit amount must be positive')
  if (input.salesOrderId) {
    const { data: so, error } = await supabase
      .from('sales_orders')
      .select('customer_id, cancelled_at, closed_at')
      .eq('id', input.salesOrderId)
      .single()
    if (error) throw error
    if (so.customer_id !== input.customerId) throw new Error('Sales order belongs to a different customer')
    if (so.cancelled_at || so.closed_at) throw new Error('Sales order is not open')
  }
  const { error } = await supabase.from('customer_deposits').insert({
    customer_id: input.customerId,
    sales_order_id: input.salesOrderId || null,
    amount_cents: input.amountCents,
    method: input.method,
    received_on: input.receivedOn,
    reference: input.reference || null,
    stripe_payout_id: input.stripePayoutId || null,
  })
  if (error) throw error
}

/** Refunds the unused part of a deposit (all of it when `amountCents` is omitted). */
export async function refundCustomerDeposit(deposit: CustomerDeposit, amountCents?: number): Promise<void> {
  const refund = amountCents ?? deposit.remainingCents
  assertRefundable(deposit.amountCents, deposit.amountAppliedCents, deposit.amountRefundedCents, refund)
  await rpc('o2c_refund_deposit', { p_deposit_id: deposit.id, p_amount_cents: refund })
}

export interface OpenInvoiceSummary {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string | null
  totalCents: number
  balanceCents: number
}

export async function listOpenInvoices(customerId: string): Promise<OpenInvoiceSummary[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, issue_date, due_date, total_cents, balance_cents')
    .eq('customer_id', customerId)
    .in('status', ['open', 'partially_paid'])
    .gt('balance_cents', 0)
    .order('due_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    invoiceNumber: r.invoice_number as string,
    issueDate: r.issue_date as string,
    dueDate: str(r.due_date),
    totalCents: r.total_cents as number,
    balanceCents: r.balance_cents as number,
  }))
}

/**
 * Receives a customer payment. Without `applications` it is auto-applied
 * oldest-due-first; anything left over stays as unapplied credit.
 */
export async function receiveCustomerPayment(input: {
  idempotencyKey: string
  customerId: string
  amountCents: number
  method: ReceiptMethod
  receivedOn: string
  reference?: string
  stripePayoutId?: string
  /** Explicit split; omitted = oldest due first. */
  applications?: Array<{ invoiceId: string; amountCents: number }>
}): Promise<string> {
  const open = await listOpenInvoices(input.customerId)
  const result = applyPayment(
    input.amountCents,
    open.map((i) => ({
      id: i.id,
      balance: i.balanceCents,
      dueDate: i.dueDate ? dateOnly(i.dueDate) : null,
      invoiceDate: dateOnly(i.issueDate),
    })),
    input.applications?.map<Application>((a) => ({ invoiceId: a.invoiceId, amount: a.amountCents })),
  )
  return rpc<string>('o2c_record_payment', {
    p_payment: {
      idempotencyKey: input.idempotencyKey,
      customerId: input.customerId,
      receivedOn: input.receivedOn,
      amountCents: input.amountCents,
      method: input.method,
      reference: input.reference ?? null,
      stripePayoutId: input.stripePayoutId ?? null,
      applications: result.applications.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amount })),
    },
  })
}

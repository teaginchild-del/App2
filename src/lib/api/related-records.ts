import { supabase } from '@/lib/supabase'
import { customerDepositStatus } from '@/lib/billing-engine'
import { str, type Row } from '@/lib/api/o2c-shared'
import { SALES_ORDER_SELECT, mapSalesOrder } from '@/lib/api/sales-orders'
import type { SalesOrder } from '@/types/order-to-cash'

/**
 * The records around a billing object, split by direction:
 *  - upstream (origin): what this record came from — customer, contract,
 *    sales order, subscription, deposits applied, invoices a payment paid,
 *    receipts gathered into a bank deposit.
 *  - downstream (impact): what it caused — billing orders, invoices,
 *    renewals, shipments, payments, refunds, bank deposits, statement
 *    matches, reminders.
 */

export type RelatedObjectType =
  | 'contract'
  | 'sales_order'
  | 'invoice'
  | 'customer_deposit'
  | 'customer_payment'
  | 'bank_deposit'
  | 'subscription'

export type RelatedKind =
  | RelatedObjectType
  | 'customer'
  | 'fulfillment'
  | 'statement_line'
  | 'dunning_notice'
  | 'refund'
  | 'credit'

export interface RelatedRecord {
  kind: RelatedKind
  id: string
  label: string
  /** How it relates to the record being viewed, e.g. "Billed from", "Paid by". */
  relation: string
  date?: string | null
  amountCents?: number | null
  /** Raw status for the kind's badge. */
  status?: string | null
  href?: string | null
}

export interface RelatedRecords {
  upstream: RelatedRecord[]
  downstream: RelatedRecord[]
}

const INVOICE_COLS = 'id, invoice_number, issue_date, total_cents, status, sales_order_id'
const DEPOSIT_COLS =
  'id, received_on, method, reference, amount_cents, amount_applied_cents, amount_refunded_cents, sales_order_id, bank_deposit_id'
const PAYMENT_COLS = 'id, received_on, method, reference, amount_cents, unapplied_cents, bank_deposit_id'
const BANK_DEPOSIT_COLS = 'id, deposit_date, amount_cents, source'
const STATEMENT_COLS = 'id, posted_on, amount_cents, description, status, bank_deposit_id'
const CONTRACT_COLS = 'id, contract_number, start_date, end_date, status, customer_id, renewed_from_id'

const SOURCE_LABELS: Record<string, string> = {
  stripe_payout: 'Stripe payout',
  check_batch: 'Check batch',
  individual: 'Individual',
}

// ---------------------------------------------------------------------------
// Record builders
// ---------------------------------------------------------------------------

function customerRec(row: Row | null | undefined): RelatedRecord[] {
  if (!row) return []
  return [{ kind: 'customer', id: row.id as string, label: row.company_name as string, relation: 'Customer' }]
}

function contractRec(row: Row, relation: string): RelatedRecord {
  return {
    kind: 'contract',
    id: row.id as string,
    label: row.contract_number as string,
    relation,
    date: str(row.start_date),
    status: str(row.status),
    href: `/contracts/${row.id as string}`,
  }
}

function orderRec(so: SalesOrder, relation: string): RelatedRecord {
  return {
    kind: 'sales_order',
    id: so.id,
    label: so.orderNumber,
    relation,
    date: so.orderDate,
    amountCents: so.lines.reduce((sum, l) => sum + l.amountCents, 0),
    status: so.status,
    href: `/sales-orders/${so.id}`,
  }
}

function invoiceRec(row: Row, relation: string, amountCents?: number): RelatedRecord {
  return {
    kind: 'invoice',
    id: row.id as string,
    label: row.invoice_number as string,
    relation,
    date: str(row.issue_date),
    amountCents: amountCents ?? (row.total_cents as number),
    status: str(row.status),
    href: `/invoices/${row.id as string}`,
  }
}

function receiptLabel(prefix: string, row: Row): string {
  const ref = str(row.reference)
  return `${prefix} · ${(row.method as string).toUpperCase()}${ref ? ` ${ref}` : ''}`
}

function depositRec(row: Row, relation: string, amountCents?: number): RelatedRecord {
  return {
    kind: 'customer_deposit',
    id: row.id as string,
    label: receiptLabel('Deposit', row),
    relation,
    date: str(row.received_on),
    amountCents: amountCents ?? (row.amount_cents as number),
    status: customerDepositStatus(
      row.amount_cents as number,
      row.amount_applied_cents as number,
      row.amount_refunded_cents as number,
    ),
    href: `/payments/deposits/${row.id as string}`,
  }
}

function paymentRec(row: Row, relation: string, amountCents?: number): RelatedRecord {
  return {
    kind: 'customer_payment',
    id: row.id as string,
    label: receiptLabel('Payment', row),
    relation,
    date: str(row.received_on),
    amountCents: amountCents ?? (row.amount_cents as number),
    href: `/payments/${row.id as string}`,
  }
}

function bankDepositRec(row: Row, relation: string): RelatedRecord {
  return {
    kind: 'bank_deposit',
    id: row.id as string,
    label: `Bank deposit · ${SOURCE_LABELS[row.source as string] ?? row.source}`,
    relation,
    date: str(row.deposit_date),
    amountCents: row.amount_cents as number,
    href: `/banking/deposits/${row.id as string}`,
  }
}

function statementLineRec(row: Row): RelatedRecord {
  return {
    kind: 'statement_line',
    id: row.id as string,
    label: (row.description as string) || 'Bank statement line',
    relation: 'Cleared on bank statement',
    date: str(row.posted_on),
    amountCents: row.amount_cents as number,
    status: str(row.status),
    href: '/banking',
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const { data, error } = await query
  if (error) throw error
  return (data as Row[] | null) ?? []
}

async function one(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row> {
  const { data, error } = await query
  if (error) throw error
  return data as Row
}

async function ordersWhere(column: 'id' | 'contract_id', value: string): Promise<SalesOrder[]> {
  const data = await rows(supabase.from('sales_orders').select(SALES_ORDER_SELECT).eq(column, value))
  return data.map(mapSalesOrder)
}

async function contractById(id: string | null | undefined): Promise<Row | null> {
  if (!id) return null
  return one(supabase.from('contracts').select(CONTRACT_COLS).eq('id', id).single())
}

async function invoicesForOrders(orderIds: string[]): Promise<Row[]> {
  if (orderIds.length === 0) return []
  return rows(supabase.from('invoices').select(INVOICE_COLS).in('sales_order_id', orderIds).order('issue_date'))
}

async function statementLinesFor(bankDepositIds: string[]): Promise<Row[]> {
  if (bankDepositIds.length === 0) return []
  return rows(supabase.from('bank_statement_lines').select(STATEMENT_COLS).in('bank_deposit_id', bankDepositIds))
}

async function bankDepositsById(ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return []
  return rows(supabase.from('bank_deposits').select(BANK_DEPOSIT_COLS).in('id', ids).order('deposit_date'))
}

/** Payments applied to any of these invoices, one record per payment with the total it applied. */
async function paymentsForInvoices(invoiceIds: string[]): Promise<Array<{ payment: Row; applied: number }>> {
  if (invoiceIds.length === 0) return []
  const apps = await rows(
    supabase
      .from('payment_applications')
      .select(`amount_cents, customer_payment:customer_payments(${PAYMENT_COLS})`)
      .in('invoice_id', invoiceIds),
  )
  const byId = new Map<string, { payment: Row; applied: number }>()
  for (const a of apps) {
    const payment = a.customer_payment as Row
    const entry = byId.get(payment.id as string) ?? { payment, applied: 0 }
    entry.applied += a.amount_cents as number
    byId.set(payment.id as string, entry)
  }
  return [...byId.values()].sort((a, b) =>
    (a.payment.received_on as string).localeCompare(b.payment.received_on as string),
  )
}

const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((v): v is string => !!v))]

async function forContract(id: string): Promise<RelatedRecords> {
  const contract = await one(
    supabase.from('contracts').select(`${CONTRACT_COLS}, customer:customers(id, company_name)`).eq('id', id).single(),
  )
  const [renewedFrom, renewals, orders] = await Promise.all([
    contractById(str(contract.renewed_from_id)),
    rows(supabase.from('contracts').select(CONTRACT_COLS).eq('renewed_from_id', id)),
    ordersWhere('contract_id', id),
  ])
  const invoices = await invoicesForOrders(orders.map((o) => o.id))
  return {
    upstream: [
      ...customerRec(contract.customer as Row),
      ...(renewedFrom ? [contractRec(renewedFrom, 'Renewal of')] : []),
    ],
    downstream: [
      ...orders.map((o) => orderRec(o, 'Billing order')),
      ...invoices.map((i) => invoiceRec(i, 'Invoiced')),
      ...renewals.map((r) => contractRec(r, 'Renewed by')),
    ],
  }
}

async function forSalesOrder(id: string): Promise<RelatedRecords> {
  const [order] = await ordersWhere('id', id)
  if (!order) throw new Error('Sales order not found')
  const [contract, deposits, invoices, fulfillments] = await Promise.all([
    contractById(order.contractId),
    rows(supabase.from('customer_deposits').select(DEPOSIT_COLS).eq('sales_order_id', id).order('received_on')),
    invoicesForOrders([id]),
    rows(
      supabase
        .from('fulfillments')
        .select('id, fulfilled_on, reference')
        .eq('sales_order_id', id)
        .order('fulfilled_on'),
    ),
  ])
  const payments = await paymentsForInvoices(invoices.map((i) => i.id as string))
  return {
    upstream: [
      { kind: 'customer', id: order.customerId, label: order.customer.companyName, relation: 'Customer' },
      ...(contract ? [contractRec(contract, 'Billed under contract')] : []),
    ],
    downstream: [
      ...deposits.map((d) => depositRec(d, 'Deposit taken')),
      ...fulfillments.map<RelatedRecord>((f) => ({
        kind: 'fulfillment',
        id: f.id as string,
        label: str(f.reference) ? `Shipment · ${f.reference as string}` : 'Shipment',
        relation: 'Fulfilled',
        date: str(f.fulfilled_on),
      })),
      ...invoices.map((i) => invoiceRec(i, 'Invoiced')),
      ...payments.map((p) => paymentRec(p.payment, 'Paid invoices', p.applied)),
    ],
  }
}

async function forInvoice(id: string): Promise<RelatedRecords> {
  const invoice = await one(
    supabase
      .from('invoices')
      .select(`${INVOICE_COLS}, subscription_id, customer:customers(id, company_name)`)
      .eq('id', id)
      .single(),
  )
  const orderId = str(invoice.sales_order_id)
  const subscriptionId = str(invoice.subscription_id)
  const [orders, subscription, depositApps, payments, notices] = await Promise.all([
    orderId ? ordersWhere('id', orderId) : Promise.resolve([] as SalesOrder[]),
    subscriptionId
      ? one(
          supabase
            .from('subscriptions')
            .select('id, status, order_date, product:products(name)')
            .eq('id', subscriptionId)
            .single(),
        )
      : Promise.resolve(null),
    rows(
      supabase
        .from('deposit_applications')
        .select(`amount_cents, customer_deposit:customer_deposits(${DEPOSIT_COLS})`)
        .eq('invoice_id', id),
    ),
    paymentsForInvoices([id]),
    rows(
      supabase
        .from('dunning_notices')
        .select('id, level, subject, delivery_status, created_at')
        .eq('invoice_id', id)
        .order('level'),
    ),
  ])
  const contract = await contractById(orders[0]?.contractId)
  const bankDeposits = await bankDepositsById(unique(payments.map((p) => str(p.payment.bank_deposit_id))))

  return {
    upstream: [
      ...customerRec(invoice.customer as Row),
      ...(contract ? [contractRec(contract, 'Contract')] : []),
      ...orders.map((o) => orderRec(o, 'Billed from order')),
      ...(subscription
        ? [
            {
              kind: 'subscription' as const,
              id: subscription.id as string,
              label: ((subscription.product as Row | null)?.name as string) ?? 'Subscription',
              relation: 'Billed from subscription',
              date: str(subscription.order_date),
              status: str(subscription.status),
              href: `/subscriptions/${subscription.id as string}`,
            },
          ]
        : []),
      ...depositApps.map((a) => depositRec(a.customer_deposit as Row, 'Deposit applied', a.amount_cents as number)),
    ],
    downstream: [
      ...payments.map((p) => paymentRec(p.payment, 'Paid by', p.applied)),
      ...bankDeposits.map((b) => bankDepositRec(b, 'Payment deposited in')),
      ...notices.map<RelatedRecord>((n) => ({
        kind: 'dunning_notice',
        id: n.id as string,
        label: n.subject as string,
        relation: `Reminder level ${n.level as number}`,
        date: (n.created_at as string).slice(0, 10),
        status: str(n.delivery_status),
        href: '/receivables',
      })),
    ],
  }
}

async function forDeposit(id: string): Promise<RelatedRecords> {
  const deposit = await one(
    supabase
      .from('customer_deposits')
      .select(`${DEPOSIT_COLS}, customer:customers(id, company_name)`)
      .eq('id', id)
      .single(),
  )
  const orderId = str(deposit.sales_order_id)
  const bankDepositId = str(deposit.bank_deposit_id)
  const [orders, apps, bankDeposits, statementLines] = await Promise.all([
    orderId ? ordersWhere('id', orderId) : Promise.resolve([] as SalesOrder[]),
    rows(
      supabase
        .from('deposit_applications')
        .select(`amount_cents, invoice:invoices(${INVOICE_COLS})`)
        .eq('customer_deposit_id', id),
    ),
    bankDepositsById(unique([bankDepositId])),
    statementLinesFor(unique([bankDepositId])),
  ])
  const contract = await contractById(orders[0]?.contractId)
  const refunded = deposit.amount_refunded_cents as number

  return {
    upstream: [
      ...customerRec(deposit.customer as Row),
      ...(contract ? [contractRec(contract, 'Contract')] : []),
      ...orders.map((o) => orderRec(o, 'Taken against order')),
    ],
    downstream: [
      ...apps.map((a) => invoiceRec(a.invoice as Row, 'Applied to invoice', a.amount_cents as number)),
      ...(refunded > 0
        ? [
            {
              kind: 'refund' as const,
              id: `${id}:refund`,
              label: 'Refund to customer',
              relation: 'Refunded',
              amountCents: refunded,
            },
          ]
        : []),
      ...bankDeposits.map((b) => bankDepositRec(b, 'Deposited in')),
      ...statementLines.map(statementLineRec),
    ],
  }
}

async function forPayment(id: string): Promise<RelatedRecords> {
  const payment = await one(
    supabase
      .from('customer_payments')
      .select(`${PAYMENT_COLS}, customer:customers(id, company_name)`)
      .eq('id', id)
      .single(),
  )
  const bankDepositId = str(payment.bank_deposit_id)
  const [apps, bankDeposits, statementLines] = await Promise.all([
    rows(
      supabase
        .from('payment_applications')
        .select(`amount_cents, invoice:invoices(${INVOICE_COLS})`)
        .eq('customer_payment_id', id),
    ),
    bankDepositsById(unique([bankDepositId])),
    statementLinesFor(unique([bankDepositId])),
  ])
  const unapplied = payment.unapplied_cents as number

  return {
    upstream: [
      ...customerRec(payment.customer as Row),
      ...apps.map((a) => invoiceRec(a.invoice as Row, 'Paid invoice', a.amount_cents as number)),
    ],
    downstream: [
      ...(unapplied > 0
        ? [
            {
              kind: 'credit' as const,
              id: `${id}:credit`,
              label: 'Unapplied credit on account',
              relation: 'Overpayment',
              amountCents: unapplied,
            },
          ]
        : []),
      ...bankDeposits.map((b) => bankDepositRec(b, 'Deposited in')),
      ...statementLines.map(statementLineRec),
    ],
  }
}

async function forBankDeposit(id: string): Promise<RelatedRecords> {
  const [payments, deposits, statementLines] = await Promise.all([
    rows(supabase.from('customer_payments').select(PAYMENT_COLS).eq('bank_deposit_id', id).order('received_on')),
    rows(supabase.from('customer_deposits').select(DEPOSIT_COLS).eq('bank_deposit_id', id).order('received_on')),
    statementLinesFor([id]),
  ])
  return {
    upstream: [
      ...payments.map((p) => paymentRec(p, 'Includes payment')),
      ...deposits.map((d) => depositRec(d, 'Includes deposit')),
    ],
    downstream: statementLines.map(statementLineRec),
  }
}

async function forSubscription(id: string): Promise<RelatedRecords> {
  const subscription = await one(
    supabase.from('subscriptions').select('id, customer:customers(id, company_name)').eq('id', id).single(),
  )
  const invoices = await rows(
    supabase.from('invoices').select(INVOICE_COLS).eq('subscription_id', id).order('issue_date'),
  )
  const payments = await paymentsForInvoices(invoices.map((i) => i.id as string))
  return {
    upstream: customerRec(subscription.customer as Row),
    downstream: [
      ...invoices.map((i) => invoiceRec(i, 'Invoiced')),
      ...payments.map((p) => paymentRec(p.payment, 'Paid invoices', p.applied)),
    ],
  }
}

export function getRelatedRecords(type: RelatedObjectType, id: string): Promise<RelatedRecords> {
  switch (type) {
    case 'contract':
      return forContract(id)
    case 'sales_order':
      return forSalesOrder(id)
    case 'invoice':
      return forInvoice(id)
    case 'customer_deposit':
      return forDeposit(id)
    case 'customer_payment':
      return forPayment(id)
    case 'bank_deposit':
      return forBankDeposit(id)
    case 'subscription':
      return forSubscription(id)
  }
}

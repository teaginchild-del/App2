import { supabase } from '@/lib/supabase'
import {
  billableAmount,
  billableQuantity,
  buildInvoiceDraft,
  dateOnly,
  dueDateFor,
  extend,
  isoDate,
  parseTerms,
  todayIso,
  type AvailableDeposit,
  type InvoiceLineInput,
  type RevenueTreatment,
} from '@/lib/billing-engine'
import { CUSTOMER_COLUMNS, mapO2cCustomer, num, rpc, str, type Row } from '@/lib/api/o2c-shared'
import { getSalesOrder, lineState, listSalesOrders } from '@/lib/api/sales-orders'
import type { Invoice, InvoiceGlLine, InvoiceLineItem } from '@/types/billing'
import type { SalesOrder } from '@/types/order-to-cash'

/**
 * Invoicing: turns billable sales-order work (or ad-hoc lines) into an
 * invoice. The engine builds the draft (due date from terms, tax, deferred
 * revenue schedule, deposit application, GL preview) and
 * o2c_reserve_invoice writes it in one transaction, re-checking that every
 * event/quantity/deposit it used is still available. The idempotency key is
 * derived from the work being billed, so a retried or concurrent run can
 * never invoice the same work twice.
 */

const INVOICE_SELECT = `*, customer:customers(${CUSTOMER_COLUMNS}), invoice_line_items(*)`

function mapLineItem(row: Row): InvoiceLineItem {
  return {
    id: row.id as string,
    description: row.description as string,
    amountCents: row.amount_cents as number,
    quantity: num(row.quantity),
    productId: str(row.product_id),
    salesOrderLineId: str(row.sales_order_line_id),
    billingEventId: str(row.billing_event_id),
    unitPriceCents: (row.unit_price_cents as number | null) ?? null,
    taxCents: (row.tax_cents as number | null) ?? 0,
    taxable: (row.taxable as boolean | null) ?? false,
    revenueTreatment: (row.revenue_treatment as InvoiceLineItem['revenueTreatment']) ?? 'point_in_time',
    deferred: (row.deferred as boolean | null) ?? false,
    revRecStart: str(row.rev_rec_start),
    revRecEnd: str(row.rev_rec_end),
  }
}

export function mapInvoice(row: Row): Invoice {
  const lineItems = ((row.invoice_line_items as Row[]) ?? [])
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map(mapLineItem)
  return {
    id: row.id as string,
    invoiceNumber: row.invoice_number as string,
    customerId: row.customer_id as string,
    customer: row.customer ? mapO2cCustomer(row.customer as Row) : null,
    subscriptionId: str(row.subscription_id),
    salesOrderId: str(row.sales_order_id),
    status: row.status as Invoice['status'],
    terms: str(row.terms),
    memo: str(row.memo),
    subtotalCents: row.subtotal_cents as number,
    taxTotalCents: row.tax_total_cents as number,
    totalCents: row.total_cents as number,
    depositAppliedCents: row.deposit_applied_cents as number,
    amountDueCents: row.amount_due_cents as number,
    balanceCents: row.balance_cents as number,
    currency: row.currency as string,
    issueDate: row.issue_date as string,
    dueDate: str(row.due_date),
    glLines: (row.gl_lines as InvoiceGlLine[] | null) ?? [],
    dunningLevel: (row.dunning_level as number | null) ?? 0,
    dunningPaused: (row.dunning_paused as boolean | null) ?? false,
    createdAt: row.created_at as string,
    lineItems,
  }
}

export async function listInvoices(filter: { customerId?: string; salesOrderId?: string } = {}): Promise<Invoice[]> {
  let query = supabase.from('invoices').select(INVOICE_SELECT).order('created_at', { ascending: false })
  if (filter.customerId) query = query.eq('customer_id', filter.customerId)
  if (filter.salesOrderId) query = query.eq('sales_order_id', filter.salesOrderId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapInvoice)
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase.from('invoices').select(INVOICE_SELECT).eq('id', id).single()
  if (error) throw error
  return mapInvoice(data)
}

export interface InvoiceActivity {
  payments: Array<{
    paymentId: string
    receivedOn: string
    method: string
    reference: string | null
    amountCents: number
  }>
  deposits: Array<{ depositId: string; receivedOn: string; method: string; amountCents: number }>
  revRec: Array<{
    id: string
    description: string
    recognizeOn: string
    amountCents: number
    recognizedAt: string | null
  }>
  dunning: Array<{ level: number; subject: string; deliveryStatus: string; createdAt: string }>
}

export async function getInvoiceActivity(invoice: Invoice): Promise<InvoiceActivity> {
  const lineIds = invoice.lineItems.map((l) => l.id)
  const [payments, deposits, revRec, dunning] = await Promise.all([
    supabase
      .from('payment_applications')
      .select('amount_cents, customer_payment:customer_payments(id, received_on, method, reference)')
      .eq('invoice_id', invoice.id),
    supabase
      .from('deposit_applications')
      .select('amount_cents, customer_deposit:customer_deposits(id, received_on, method)')
      .eq('invoice_id', invoice.id),
    lineIds.length
      ? supabase.from('rev_rec_entries').select('*').in('invoice_line_item_id', lineIds).order('recognize_on')
      : Promise.resolve({ data: [] as Row[], error: null }),
    supabase.from('dunning_notices').select('*').eq('invoice_id', invoice.id).order('level'),
  ])
  for (const r of [payments, deposits, revRec, dunning]) if (r.error) throw r.error

  const lineDesc = new Map(invoice.lineItems.map((l) => [l.id, l.description]))
  return {
    payments: ((payments.data ?? []) as Row[]).map((a) => {
      const p = a.customer_payment as Row
      return {
        paymentId: p.id as string,
        receivedOn: p.received_on as string,
        method: p.method as string,
        reference: str(p.reference),
        amountCents: a.amount_cents as number,
      }
    }),
    deposits: ((deposits.data ?? []) as Row[]).map((a) => {
      const d = a.customer_deposit as Row
      return {
        depositId: d.id as string,
        receivedOn: d.received_on as string,
        method: d.method as string,
        amountCents: a.amount_cents as number,
      }
    }),
    revRec: ((revRec.data ?? []) as Row[]).map((r) => ({
      id: r.id as string,
      description: lineDesc.get(r.invoice_line_item_id as string) ?? '',
      recognizeOn: r.recognize_on as string,
      amountCents: r.amount_cents as number,
      recognizedAt: str(r.recognized_at),
    })),
    dunning: ((dunning.data ?? []) as Row[]).map((n) => ({
      level: n.level as number,
      subject: n.subject as string,
      deliveryStatus: n.delivery_status as string,
      createdAt: n.created_at as string,
    })),
  }
}

async function availableDeposits(customerId: string): Promise<AvailableDeposit[]> {
  const { data, error } = await supabase
    .from('customer_deposits')
    .select('id, sales_order_id, received_on, amount_cents, amount_applied_cents, amount_refunded_cents')
    .eq('customer_id', customerId)
  if (error) throw error
  return (data ?? [])
    .map((d) => ({
      id: d.id as string,
      remaining: (d.amount_cents as number) - (d.amount_applied_cents as number) - (d.amount_refunded_cents as number),
      salesOrderId: str(d.sales_order_id),
      receivedAt: dateOnly(d.received_on as string),
    }))
    .filter((d) => d.remaining > 0)
}

interface SourcedLine extends InvoiceLineInput {
  /** Quantity added to the SO line's quantity billed once reserved. */
  addQuantityBilled: number
  /** The SO line's quantity billed this was computed from (optimistic check). */
  expectedQuantityBilled: number | null
}

export type BillingScope = 'all' | 'scheduled'

/** Only carry quantity × unit price when it reproduces the line amount exactly. */
function qtyPrice(quantity: number, unitPriceCents: number, amount: number) {
  return extend(quantity, unitPriceCents) === amount ? { quantity, unitPrice: unitPriceCents } : {}
}

/**
 * Everything billable on an order as of `asOf`: due schedule events
 * (installments, completed milestones, recurring periods), fulfilled goods,
 * and unbilled services. With scope 'scheduled' only due events are billed
 * — what the scheduled billing run uses.
 */
export function collectBillableLines(so: SalesOrder, asOf: Date, scope: BillingScope): SourcedLine[] {
  const cutoff = isoDate(asOf)
  const out: SourcedLine[] = []

  for (const line of so.lines) {
    const base = {
      salesOrderLineId: line.id,
      productId: line.productId,
      taxable: line.taxable,
      taxRatePercent: line.taxRatePercent,
      revenueTreatment: line.revenueTreatment,
    }

    if (line.billingSchedule != null) {
      const due = line.billingEvents.filter((e) => e.status === 'pending' && e.billDate && e.billDate <= cutoff)
      for (const e of due) {
        const period = e.periodStart && e.periodEnd ? ` (${e.periodStart} – ${e.periodEnd})` : ''
        const label = e.milestoneName ? ` — ${e.milestoneName}` : period
        const revRecStart = e.periodStart ?? line.revRecStart
        const revRecEnd = e.periodEnd ?? line.revRecEnd
        out.push({
          ...base,
          billingEventId: e.id,
          description: `${line.description}${label}`,
          amount: e.amountCents,
          ...(e.periodStart ? qtyPrice(line.quantity, line.unitPriceCents, e.amountCents) : {}),
          revRecStart: revRecStart ? dateOnly(revRecStart) : undefined,
          revRecEnd: revRecEnd ? dateOnly(revRecEnd) : undefined,
          addQuantityBilled: 0,
          expectedQuantityBilled: null,
        })
      }
      continue
    }

    if (scope === 'scheduled') continue
    const state = lineState(line)
    const qty = billableQuantity(state)
    if (qty <= 0) continue
    const amount = billableAmount(state, qty)
    out.push({
      ...base,
      description: line.description,
      amount,
      ...qtyPrice(qty, state.unitPrice, amount),
      revRecStart: line.revRecStart ? dateOnly(line.revRecStart) : undefined,
      revRecEnd: line.revRecEnd ? dateOnly(line.revRecEnd) : undefined,
      addQuantityBilled: qty,
      expectedQuantityBilled: line.quantityBilled,
    })
  }
  return out
}

async function reserveInvoice(params: {
  idempotencyKey: string
  customerId: string
  salesOrderId: string | null
  invoiceDate: Date
  terms: string
  memo?: string
  sourced: SourcedLine[]
  applyUnlinkedDeposits: boolean
}): Promise<string> {
  const draft = buildInvoiceDraft({
    invoiceDate: params.invoiceDate,
    terms: parseTerms(params.terms),
    lines: params.sourced,
    deposits: await availableDeposits(params.customerId),
    salesOrderId: params.salesOrderId,
    applyUnlinkedDeposits: params.applyUnlinkedDeposits,
  })

  return rpc<string>('o2c_reserve_invoice', {
    p_invoice: {
      idempotencyKey: params.idempotencyKey,
      customerId: params.customerId,
      salesOrderId: params.salesOrderId,
      invoiceDate: isoDate(draft.invoiceDate),
      dueDate: isoDate(draft.dueDate),
      terms: params.terms,
      memo: params.memo ?? null,
      subtotalCents: draft.subtotal,
      taxTotalCents: draft.taxTotal,
      totalCents: draft.total,
      depositAppliedCents: draft.depositApplied,
      glLines: draft.gl,
      lines: draft.lines.map((l, i) => ({
        salesOrderLineId: l.salesOrderLineId ?? null,
        billingEventId: l.billingEventId ?? null,
        productId: l.productId ?? null,
        description: l.description,
        quantity: l.quantity ?? null,
        unitPriceCents: l.unitPrice ?? null,
        amountCents: l.amount,
        taxCents: l.taxAmount,
        taxable: l.taxable,
        revenueTreatment: l.revenueTreatment,
        deferred: l.deferred,
        revRecStart: l.revRecStart ? isoDate(l.revRecStart) : null,
        revRecEnd: l.revRecEnd ? isoDate(l.revRecEnd) : null,
        addQuantityBilled: params.sourced[i].addQuantityBilled,
        expectedQuantityBilled: params.sourced[i].expectedQuantityBilled,
        revRec: l.revRecSchedule.map((r) => ({ recognizeOn: isoDate(r.recognizeOn), amountCents: r.amount })),
      })),
      depositApplications: draft.depositApplications.map((d) => ({ depositId: d.depositId, amountCents: d.amount })),
    },
  })
}

/**
 * One-click billing of a sales order: invoices everything billable as of
 * `asOf` (fulfilled goods, unbilled services, due schedule events), applying
 * the order's deposits first.
 */
export async function billSalesOrder(
  salesOrderId: string,
  opts: { asOf?: string; invoiceDate?: string; scope?: BillingScope; applyUnlinkedDeposits?: boolean } = {},
): Promise<string> {
  const so = await getSalesOrder(salesOrderId)
  if (so.cancelledAt || so.closedAt) throw new Error('Order is cancelled or closed')
  if (!so.approvedAt) throw new Error('Order is pending approval')

  const asOf = dateOnly(opts.asOf ?? todayIso())
  const sourced = collectBillableLines(so, asOf, opts.scope ?? 'all')
  if (sourced.length === 0) throw new Error('Nothing is billable on this order yet')

  const workKey = sourced
    .map((s) =>
      s.billingEventId
        ? `e:${s.billingEventId}`
        : `l:${s.salesOrderLineId}:${s.expectedQuantityBilled}:${s.addQuantityBilled}`,
    )
    .join('|')

  return reserveInvoice({
    idempotencyKey: `so:${so.id}:${workKey}`,
    customerId: so.customerId,
    salesOrderId: so.id,
    invoiceDate: dateOnly(opts.invoiceDate ?? isoDate(asOf)),
    terms: so.terms,
    memo: `Sales order ${so.orderNumber}`,
    sourced,
    applyUnlinkedDeposits: opts.applyUnlinkedDeposits ?? false,
  })
}

/** How much a bill-now would invoice, for previewing before committing. */
export function previewBillableCents(so: SalesOrder, asOf: string): number {
  return collectBillableLines(so, dateOnly(asOf), 'all').reduce((sum, l) => sum + l.amount, 0)
}

export interface StandaloneInvoiceLine {
  productId: string | null
  description: string
  quantity: number
  unitPriceCents: number
  taxable: boolean
  taxRatePercent: number
  revenueTreatment: RevenueTreatment
  revRecStart?: string | null
  revRecEnd?: string | null
}

/** An invoice created on its own, with no sales order behind it. */
export async function createStandaloneInvoice(input: {
  idempotencyKey: string
  customerId: string
  invoiceDate: string
  terms: string
  memo?: string
  applyUnlinkedDeposits: boolean
  lines: StandaloneInvoiceLine[]
}): Promise<string> {
  const sourced: SourcedLine[] = input.lines.map((l, i) => {
    if (!l.description.trim()) throw new Error(`Line ${i + 1}: description is required`)
    if (!(l.quantity > 0)) throw new Error(`Line ${i + 1}: quantity must be positive`)
    const amount = extend(l.quantity, l.unitPriceCents)
    return {
      productId: l.productId,
      description: l.description.trim(),
      amount,
      quantity: l.quantity,
      unitPrice: l.unitPriceCents,
      taxable: l.taxable,
      taxRatePercent: l.taxRatePercent,
      revenueTreatment: l.revenueTreatment,
      revRecStart: l.revRecStart ? dateOnly(l.revRecStart) : undefined,
      revRecEnd: l.revRecEnd ? dateOnly(l.revRecEnd) : undefined,
      addQuantityBilled: 0,
      expectedQuantityBilled: null,
    }
  })

  return reserveInvoice({
    idempotencyKey: `manual:${input.idempotencyKey}`,
    customerId: input.customerId,
    salesOrderId: null,
    invoiceDate: dateOnly(input.invoiceDate),
    terms: input.terms,
    memo: input.memo,
    sourced,
    applyUnlinkedDeposits: input.applyUnlinkedDeposits,
  })
}

/**
 * Issues a draft invoice (e.g. the first-period draft the Subscription
 * wizard creates): due date from the customer's terms, totals and GL
 * preview filled in, status draft → open.
 */
export async function issueDraftInvoice(invoice: Invoice, terms: string): Promise<void> {
  if (invoice.status !== 'draft') throw new Error('Only a draft invoice can be issued')
  const issueDate = dateOnly(invoice.issueDate)
  const total = invoice.lineItems.reduce((sum, l) => sum + l.amountCents, 0)
  if (total < 0) throw new Error('Invoice total cannot be negative')
  const gl: InvoiceGlLine[] = [
    { account: 'accounts_receivable', debit: total, credit: 0 },
    { account: 'revenue', debit: 0, credit: total },
  ]
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: total === 0 ? 'paid' : 'open',
      terms,
      due_date: isoDate(dueDateFor(issueDate, parseTerms(terms))),
      subtotal_cents: total,
      total_cents: total,
      amount_due_cents: total,
      balance_cents: total,
      gl_lines: total === 0 ? [] : gl,
    })
    .eq('id', invoice.id)
    .eq('status', 'draft')
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Invoice was already issued — refresh and try again')
}

export async function setDunningPaused(invoiceId: string, paused: boolean): Promise<void> {
  const { error } = await supabase.from('invoices').update({ dunning_paused: paused }).eq('id', invoiceId)
  if (error) throw error
}

export interface ScheduledBillingResult {
  billed: number
  failed: Array<{ orderNumber: string; error: string }>
}

/** Scheduled billing run: invoices every due installment/milestone/recurring period. */
export async function runScheduledBilling(asOf: string): Promise<ScheduledBillingResult> {
  const orders = (await listSalesOrders()).filter(
    (so) =>
      so.approvedAt &&
      !so.cancelledAt &&
      !so.closedAt &&
      so.lines.some((l) => l.billingEvents.some((e) => e.status === 'pending' && e.billDate && e.billDate <= asOf)),
  )

  const result: ScheduledBillingResult = { billed: 0, failed: [] }
  for (const so of orders) {
    try {
      await billSalesOrder(so.id, { asOf, scope: 'scheduled' })
      result.billed++
    } catch (err) {
      result.failed.push({ orderNumber: so.orderNumber, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

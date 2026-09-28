import { supabase } from '@/lib/supabase'
import {
  deriveSalesOrderStatus,
  extend,
  isoDate,
  parseTerms,
  planBillingEvents,
  recurringLineTotal,
  validateFulfillment,
  type BillingScheduleSpec,
  type ItemKind,
  type RevenueTreatment,
  type SalesOrderLineState,
  type SalesOrderState,
} from '@/lib/billing-engine'
import { CUSTOMER_COLUMNS, mapO2cCustomer, num, rpc, str, type Row } from '@/lib/api/o2c-shared'
import type { BillingEvent, Fulfillment, SalesOrder, SalesOrderLine } from '@/types/order-to-cash'

export const SALES_ORDER_SELECT = `*,
  customer:customers(${CUSTOMER_COLUMNS}),
  sales_order_lines(*, billing_events(*))`

function mapEvent(row: Row): BillingEvent {
  return {
    id: row.id as string,
    salesOrderLineId: row.sales_order_line_id as string,
    seq: row.seq as number,
    billDate: str(row.bill_date),
    amountCents: row.amount_cents as number,
    periodStart: str(row.period_start),
    periodEnd: str(row.period_end),
    milestoneName: str(row.milestone_name),
    milestoneCompletedAt: str(row.milestone_completed_at),
    status: row.status as BillingEvent['status'],
  }
}

function mapLine(row: Row): SalesOrderLine {
  return {
    id: row.id as string,
    lineNo: row.line_no as number,
    productId: str(row.product_id),
    description: row.description as string,
    itemKind: row.item_kind as ItemKind,
    quantity: num(row.quantity),
    unitPriceCents: row.unit_price_cents as number,
    amountCents: row.amount_cents as number,
    quantityFulfilled: num(row.quantity_fulfilled),
    quantityBilled: num(row.quantity_billed),
    amountBilledCents: row.amount_billed_cents as number,
    taxable: row.taxable as boolean,
    taxRatePercent: num(row.tax_rate_percent),
    revenueTreatment: row.revenue_treatment as RevenueTreatment,
    revRecStart: str(row.rev_rec_start),
    revRecEnd: str(row.rev_rec_end),
    billingSchedule: (row.billing_schedule as BillingScheduleSpec | null) ?? null,
    contractItemId: str(row.contract_item_id),
    billingEvents: ((row.billing_events as Row[]) ?? []).map(mapEvent).sort((a, b) => a.seq - b.seq),
  }
}

export function lineState(line: SalesOrderLine): SalesOrderLineState {
  return {
    id: line.id,
    itemKind: line.itemKind,
    quantity: line.quantity,
    unitPrice: line.unitPriceCents,
    amount: line.amountCents,
    quantityFulfilled: line.quantityFulfilled,
    quantityBilled: line.quantityBilled,
    amountBilled: line.amountBilledCents,
    scheduled: line.billingSchedule != null,
  }
}

export function orderState(so: Pick<SalesOrder, 'approvedAt' | 'cancelledAt' | 'closedAt' | 'lines'>): SalesOrderState {
  return {
    approved: so.approvedAt != null,
    cancelled: so.cancelledAt != null,
    closed: so.closedAt != null,
    lines: so.lines.map(lineState),
  }
}

export function mapSalesOrder(row: Row): SalesOrder {
  const lines = ((row.sales_order_lines as Row[]) ?? []).map(mapLine).sort((a, b) => a.lineNo - b.lineNo)
  const base = {
    id: row.id as string,
    orderNumber: row.order_number as string,
    customerId: row.customer_id as string,
    customer: mapO2cCustomer(row.customer as Row),
    orderDate: row.order_date as string,
    terms: row.terms as string,
    currency: row.currency as string,
    memo: str(row.memo),
    depositRequestedCents: (row.deposit_requested_cents as number | null) ?? null,
    requiresApproval: row.requires_approval as boolean,
    approvedAt: str(row.approved_at),
    approvedBy: str(row.approved_by),
    cancelledAt: str(row.cancelled_at),
    closedAt: str(row.closed_at),
    contractId: str(row.contract_id),
    createdAt: row.created_at as string,
    lines,
  }
  return { ...base, status: deriveSalesOrderStatus(orderState(base)) }
}

export async function listSalesOrders(): Promise<SalesOrder[]> {
  const { data, error } = await supabase
    .from('sales_orders')
    .select(SALES_ORDER_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapSalesOrder)
}

export async function getSalesOrder(id: string): Promise<SalesOrder> {
  const { data, error } = await supabase.from('sales_orders').select(SALES_ORDER_SELECT).eq('id', id).single()
  if (error) throw error
  return mapSalesOrder(data)
}

export async function listFulfillments(salesOrderId: string): Promise<Fulfillment[]> {
  const { data, error } = await supabase
    .from('fulfillments')
    .select('*, fulfillment_lines(sales_order_line_id, quantity)')
    .eq('sales_order_id', salesOrderId)
    .order('fulfilled_on', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    fulfilledOn: row.fulfilled_on as string,
    reference: str(row.reference),
    lines: ((row.fulfillment_lines as Row[]) ?? []).map((l) => ({
      salesOrderLineId: l.sales_order_line_id as string,
      quantity: num(l.quantity),
    })),
  }))
}

export interface SalesOrderLineInput {
  id?: string
  productId: string | null
  description: string
  itemKind: ItemKind
  quantity: number
  unitPriceCents: number
  taxable: boolean
  taxRatePercent: number
  revenueTreatment: RevenueTreatment
  revRecStart?: string | null
  revRecEnd?: string | null
  billingSchedule?: BillingScheduleSpec | null
  contractItemId?: string | null
}

export interface SalesOrderInput {
  id?: string
  customerId: string
  orderDate: string
  terms: string
  memo?: string
  depositRequestedCents?: number | null
  requiresApproval: boolean
  approvedBy?: string
  contractId?: string | null
  lines: SalesOrderLineInput[]
}

/** Line amount: quantity × price, or the whole recurring term when priced per period. */
export function salesOrderLineAmount(
  line: Pick<SalesOrderLineInput, 'quantity' | 'unitPriceCents' | 'billingSchedule'>,
): number {
  const schedule = line.billingSchedule
  if (schedule?.type === 'recurring' && schedule.amountPerPeriod != null) return recurringLineTotal(schedule)
  return extend(line.quantity, line.unitPriceCents)
}

/**
 * Validates an order with the engine and builds the o2c_create_sales_order
 * payload (lines plus their planned billing events). Shared with contracts,
 * whose items bill through an order of their own.
 */
export function buildSalesOrderPayload(input: SalesOrderInput): Record<string, unknown> {
  if (input.lines.length === 0) throw new Error('A sales order needs at least one line')
  parseTerms(input.terms) // fail fast on unrecognized terms

  return {
    id: input.id,
    customerId: input.customerId,
    orderDate: input.orderDate,
    terms: input.terms,
    memo: input.memo,
    depositRequestedCents: input.depositRequestedCents ?? null,
    requiresApproval: input.requiresApproval,
    approvedBy: input.approvedBy,
    contractId: input.contractId ?? null,
    lines: input.lines.map((line, i) => {
      if (!line.description.trim()) throw new Error(`Line ${i + 1}: description is required`)
      if (!(line.quantity > 0)) throw new Error(`Line ${i + 1}: quantity must be positive`)
      if (line.revenueTreatment === 'ratable' && !line.billingSchedule && (!line.revRecStart || !line.revRecEnd)) {
        throw new Error(`Line ${i + 1}: ratable revenue needs a service start and end date`)
      }
      const amount = salesOrderLineAmount(line)
      const events = line.billingSchedule ? planBillingEvents(line.billingSchedule, amount) : []
      return {
        id: line.id,
        lineNo: i + 1,
        productId: line.productId,
        description: line.description.trim(),
        itemKind: line.itemKind,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        amountCents: amount,
        taxable: line.taxable,
        taxRatePercent: line.taxRatePercent,
        revenueTreatment: line.revenueTreatment,
        revRecStart: line.revRecStart || null,
        revRecEnd: line.revRecEnd || null,
        billingSchedule: line.billingSchedule ?? null,
        contractItemId: line.contractItemId ?? null,
        events: events.map((e) => ({
          seq: e.seq,
          billDate: e.billDate ? isoDate(e.billDate) : null,
          amountCents: e.amount,
          periodStart: e.periodStart ? isoDate(e.periodStart) : null,
          periodEnd: e.periodEnd ? isoDate(e.periodEnd) : null,
          milestoneName: e.milestoneName ?? null,
        })),
      }
    }),
  }
}

export async function createSalesOrder(input: SalesOrderInput): Promise<string> {
  return rpc<string>('o2c_create_sales_order', { p_order: buildSalesOrderPayload(input) })
}

export async function approveSalesOrder(id: string, approvedBy = 'admin'): Promise<void> {
  await rpc('o2c_approve_sales_order', { p_order_id: id, p_approved_by: approvedBy })
}

/** Only an order with nothing billed can be cancelled; otherwise close it. */
export async function cancelSalesOrder(id: string): Promise<void> {
  await rpc('o2c_end_sales_order', { p_order_id: id, p_action: 'cancel' })
}

/** Stops further fulfillment and billing on a partially billed order. */
export async function closeSalesOrder(id: string): Promise<void> {
  await rpc('o2c_end_sales_order', { p_order_id: id, p_action: 'close' })
}

export async function recordFulfillment(
  order: SalesOrder,
  input: { fulfilledOn: string; reference?: string; lines: Array<{ lineId: string; quantity: number }> },
): Promise<void> {
  const lines = input.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) throw new Error('Enter a quantity to fulfill on at least one line')
  validateFulfillment(orderState(order), lines)
  await rpc('o2c_record_fulfillment', {
    p_order_id: order.id,
    p_fulfilled_on: input.fulfilledOn,
    p_reference: input.reference ?? '',
    p_lines: lines,
  })
}

/** Marks a milestone complete, which makes its billing event due on `completedOn`. */
export async function completeMilestone(event: BillingEvent, completedOn: string): Promise<void> {
  if (!event.milestoneName) throw new Error('Not a milestone event')
  if (event.status !== 'pending') throw new Error(`Milestone is already ${event.status}`)
  const { data, error } = await supabase
    .from('billing_events')
    .update({ bill_date: completedOn, milestone_completed_at: new Date().toISOString() })
    .eq('id', event.id)
    .eq('status', 'pending')
    .is('bill_date', null)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Milestone was already completed — refresh and try again')
}

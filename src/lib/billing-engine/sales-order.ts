import { extend, type Cents } from './money'

/**
 * Sales orders are commitments, not postings — nothing here touches the
 * ledger. Status is always *derived* from line progress (approved?
 * fulfilled? billed?) rather than stored and hand-edited, so it can never
 * disagree with the quantities underneath it.
 */

export type SalesOrderStatus =
  | 'pending_approval'
  | 'pending_fulfillment'
  | 'pending_billing'
  | 'partially_billed'
  | 'billed'
  | 'cancelled'
  | 'closed'

/**
 * Inventory lines must ship before they can be billed. Non-inventory and
 * service lines are billable as soon as the order is approved.
 */
export type ItemKind = 'inventory' | 'non_inventory' | 'service'

export interface SalesOrderLineState {
  id: string
  itemKind: ItemKind
  quantity: number
  unitPrice: Cents
  amount: Cents
  quantityFulfilled: number
  quantityBilled: number
  amountBilled: Cents
  /** Lines on a billing schedule bill by event amount, not by quantity. */
  scheduled: boolean
}

export interface SalesOrderState {
  approved: boolean
  cancelled: boolean
  closed: boolean
  lines: SalesOrderLineState[]
}

export function isLineFullyBilled(line: SalesOrderLineState): boolean {
  return line.amountBilled >= line.amount
}

/** Quantity that can be billed right now on an unscheduled line. */
export function billableQuantity(line: SalesOrderLineState): number {
  if (line.scheduled) return 0
  const ceiling = line.itemKind === 'inventory' ? line.quantityFulfilled : line.quantity
  return Math.max(0, ceiling - line.quantityBilled)
}

/**
 * Billable amount for `qty` units of an unscheduled line. The final bill on
 * a line takes whatever amount is left, so rounding across partial bills
 * never leaves a stray cent unbilled (or double-billed).
 */
export function billableAmount(line: SalesOrderLineState, qty: number): Cents {
  if (qty <= 0) return 0
  if (line.quantityBilled + qty >= line.quantity) return line.amount - line.amountBilled
  return extend(qty, line.unitPrice)
}

export function deriveSalesOrderStatus(order: SalesOrderState): SalesOrderStatus {
  if (order.cancelled) return 'cancelled'
  if (order.closed) return 'closed'
  if (!order.approved) return 'pending_approval'

  const lines = order.lines
  if (lines.length > 0 && lines.every(isLineFullyBilled)) return 'billed'
  if (lines.some((l) => l.amountBilled > 0)) return 'partially_billed'
  if (lines.some((l) => l.scheduled || billableQuantity(l) > 0)) return 'pending_billing'
  return 'pending_fulfillment'
}

/** Validates a fulfillment against open quantities before it is recorded. */
export function validateFulfillment(
  order: SalesOrderState,
  fulfilled: Array<{ lineId: string; quantity: number }>,
): void {
  const status = deriveSalesOrderStatus(order)
  if (status === 'pending_approval') throw new Error('Order must be approved before fulfillment')
  if (status === 'cancelled' || status === 'closed') throw new Error(`Order is ${status}`)

  for (const f of fulfilled) {
    const line = order.lines.find((l) => l.id === f.lineId)
    if (!line) throw new Error(`Line ${f.lineId} is not on this order`)
    if (line.itemKind !== 'inventory') throw new Error(`Line ${f.lineId} is not an inventory item; nothing to ship`)
    if (!(f.quantity > 0)) throw new Error(`Fulfillment quantity for ${f.lineId} must be positive`)
    if (line.quantityFulfilled + f.quantity > line.quantity) {
      throw new Error(
        `Line ${f.lineId}: fulfilling ${f.quantity} would exceed ordered quantity ${line.quantity} (already fulfilled ${line.quantityFulfilled})`,
      )
    }
  }
}

import { dateOnly } from './dates'
import { sum, type Cents } from './money'

/**
 * Cash application — the three NetSuite records that are easy to confuse:
 *
 *  - Customer payment: money against invoices that already exist. One payment
 *    can be split across several invoices; a partial payment leaves the
 *    invoice open.
 *  - Customer deposit: a prepayment taken before an invoice exists (usually
 *    tied to a sales order). Held in a liability account and applied to the
 *    invoice when it is created, lowering the balance due.
 *  - Bank deposit: see bank-reconciliation.ts.
 */

export type InvoicePaymentStatus = 'open' | 'partially_paid' | 'paid'

export function invoicePaymentStatus(total: Cents, balance: Cents): InvoicePaymentStatus {
  if (balance <= 0) return 'paid'
  if (balance < total) return 'partially_paid'
  return 'open'
}

export interface OpenInvoice {
  id: string
  balance: Cents
  dueDate: Date | null
  invoiceDate: Date | null
}

export interface Application {
  invoiceId: string
  amount: Cents
}

export interface PaymentApplicationResult {
  applications: Application[]
  /** Left on the customer's account as an unapplied credit. */
  unapplied: Cents
}

/**
 * Applies a payment across open invoices. With `explicit` allocations the
 * caller decides the split (and it is validated); otherwise the payment is
 * auto-applied oldest-due-first, which is what a customer normally intends
 * when they send one check for "what I owe".
 */
export function applyPayment(
  amount: Cents,
  openInvoices: OpenInvoice[],
  explicit?: Application[],
): PaymentApplicationResult {
  if (amount <= 0) throw new Error('Payment amount must be positive')

  if (explicit) {
    const byId = new Map(openInvoices.map((i) => [i.id, i]))
    const seen = new Set<string>()
    for (const a of explicit) {
      const inv = byId.get(a.invoiceId)
      if (!inv) throw new Error(`Invoice ${a.invoiceId} is not open for this customer`)
      if (seen.has(a.invoiceId)) throw new Error(`Invoice ${a.invoiceId} appears twice`)
      seen.add(a.invoiceId)
      if (a.amount <= 0) throw new Error(`Application to ${a.invoiceId} must be positive`)
      if (a.amount > inv.balance) {
        throw new Error(`Application of ${a.amount} exceeds invoice ${a.invoiceId} balance ${inv.balance}`)
      }
    }
    const applied = sum(explicit.map((a) => a.amount))
    if (applied > amount) throw new Error(`Applications total ${applied} exceeds payment ${amount}`)
    return { applications: explicit, unapplied: amount - applied }
  }

  const ordered = [...openInvoices]
    .filter((i) => i.balance > 0)
    .sort((a, b) => sortKey(a) - sortKey(b) || a.id.localeCompare(b.id))

  let remaining = amount
  const applications: Application[] = []
  for (const inv of ordered) {
    if (remaining <= 0) break
    const take = Math.min(remaining, inv.balance)
    applications.push({ invoiceId: inv.id, amount: take })
    remaining -= take
  }
  return { applications, unapplied: remaining }
}

function sortKey(i: OpenInvoice): number {
  const d = i.dueDate ?? i.invoiceDate
  return d ? dateOnly(d).getTime() : Number.MAX_SAFE_INTEGER
}

export interface AvailableDeposit {
  id: string
  remaining: Cents
  salesOrderId: string | null
  receivedAt: Date
}

export interface DepositApplication {
  depositId: string
  amount: Cents
}

/**
 * Applies customer deposits to a new invoice's total. Deposits taken against
 * the invoice's own sales order go first; unlinked (customer-level)
 * deposits are only used if `includeUnlinked` is set. Oldest first within
 * each group. Deposits for *other* sales orders are never touched — that
 * money was taken for a different commitment.
 */
export function applyDeposits(
  invoiceTotal: Cents,
  deposits: AvailableDeposit[],
  salesOrderId: string | null,
  includeUnlinked = false,
): DepositApplication[] {
  const eligible = deposits
    .filter((d) => d.remaining > 0)
    .filter((d) =>
      d.salesOrderId === null ? includeUnlinked : salesOrderId !== null && d.salesOrderId === salesOrderId,
    )
    .sort(
      (a, b) =>
        Number(b.salesOrderId !== null) - Number(a.salesOrderId !== null) ||
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        a.id.localeCompare(b.id),
    )

  let remaining = invoiceTotal
  const out: DepositApplication[] = []
  for (const d of eligible) {
    if (remaining <= 0) break
    const take = Math.min(remaining, d.remaining)
    out.push({ depositId: d.id, amount: take })
    remaining -= take
  }
  return out
}

export type CustomerDepositStatus = 'unapplied' | 'partially_applied' | 'fully_applied' | 'refunded'

export function customerDepositStatus(amount: Cents, applied: Cents, refunded: Cents): CustomerDepositStatus {
  if (applied + refunded >= amount) return refunded > 0 && applied === 0 ? 'refunded' : 'fully_applied'
  if (applied > 0 || refunded > 0) return 'partially_applied'
  return 'unapplied'
}

/** Only the unused portion of a deposit can be refunded. */
export function assertRefundable(amount: Cents, applied: Cents, refunded: Cents, refund: Cents): void {
  const available = amount - applied - refunded
  if (refund <= 0) throw new Error('Refund amount must be positive')
  if (refund > available) throw new Error(`Refund ${refund} exceeds unused deposit balance ${available}`)
}

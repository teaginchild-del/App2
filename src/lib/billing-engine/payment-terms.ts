import { addDays, addMonths, dateOnly, endOfMonth } from './dates'
import { percentOf, type Cents } from './money'

/**
 * Payment terms, from which the invoice due date is calculated (the way
 * NetSuite derives Due Date from the Terms field instead of asking for it).
 */
export type PaymentTerms =
  | { type: 'due_on_receipt' }
  /** Net N days from the invoice date, e.g. Net 30. */
  | { type: 'net'; days: number; discountPercent?: number; discountDays?: number }
  /** N days after the end of the invoice month, e.g. EOM 15. */
  | { type: 'end_of_month'; days: number }
  /** Due on a fixed day of the following month, e.g. the 10th. */
  | { type: 'day_of_next_month'; dayOfMonth: number }

export const COMMON_TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '2% 10 Net 30', 'EOM 15']

export function dueDateFor(invoiceDate: Date, terms: PaymentTerms): Date {
  const d = dateOnly(invoiceDate)
  switch (terms.type) {
    case 'due_on_receipt':
      return d
    case 'net':
      return addDays(d, terms.days)
    case 'end_of_month':
      return addDays(endOfMonth(d), terms.days)
    case 'day_of_next_month': {
      const next = addMonths(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), 1)
      const lastDay = endOfMonth(next).getUTCDate()
      next.setUTCDate(Math.min(terms.dayOfMonth, lastDay))
      return next
    }
  }
}

/**
 * Early-payment discount (e.g. "2% 10 Net 30") available if paid on or before
 * `paidOn`. Returns 0 when the terms have no discount or the window passed.
 */
export function earlyPaymentDiscount(invoiceDate: Date, terms: PaymentTerms, total: Cents, paidOn: Date): Cents {
  if (terms.type !== 'net' || !terms.discountPercent || terms.discountDays == null) return 0
  const deadline = addDays(invoiceDate, terms.discountDays)
  return dateOnly(paidOn) <= deadline ? percentOf(total, terms.discountPercent) : 0
}

/** Parses the common shorthand stored on customers/orders: "Net 30", "Due on receipt", "2% 10 Net 30", "EOM 15". */
export function parseTerms(label: string): PaymentTerms {
  const s = label.trim().toLowerCase()
  if (s === 'due on receipt' || s === 'net 0') return { type: 'due_on_receipt' }
  let m = /^(\d+(?:\.\d+)?)%\s*(\d+)\s*,?\s*net\s*(\d+)$/.exec(s)
  if (m) return { type: 'net', discountPercent: Number(m[1]), discountDays: Number(m[2]), days: Number(m[3]) }
  m = /^net\s*(\d+)$/.exec(s)
  if (m) return { type: 'net', days: Number(m[1]) }
  m = /^eom(?:\s*(\d+))?$/.exec(s)
  if (m) return { type: 'end_of_month', days: Number(m[1] ?? 0) }
  throw new Error(`Unrecognized payment terms: "${label}"`)
}

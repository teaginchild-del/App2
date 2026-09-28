import { addDays, dateOnly, daysInclusive, endOfMonth, maxDate, minDate } from './dates'
import { allocate, type Cents } from './money'

/**
 * point_in_time: earned when invoiced — credit Revenue.
 * ratable: earned evenly over a service period — credit Deferred Revenue at
 * invoice time, then release to Revenue month by month.
 */
export type RevenueTreatment = 'point_in_time' | 'ratable'

export interface RevRecEntry {
  /** Last day of the month (or of the service period, if earlier) being recognized. */
  recognizeOn: Date
  amount: Cents
}

/**
 * Straight-line, day-weighted recognition of `amount` over [start, end],
 * one entry per calendar month touched. Entries sum exactly to `amount`.
 */
export function ratableSchedule(amount: Cents, start: Date, end: Date): RevRecEntry[] {
  const s = dateOnly(start)
  const e = dateOnly(end)
  if (e < s) throw new Error('Revenue period end is before start')

  const slices: Array<{ recognizeOn: Date; days: number }> = []
  for (let cursor = s; cursor <= e; ) {
    const sliceEnd = minDate(endOfMonth(cursor), e)
    slices.push({ recognizeOn: sliceEnd, days: daysInclusive(maxDate(cursor, s), sliceEnd) })
    cursor = addDays(sliceEnd, 1)
  }
  const amounts = allocate(
    amount,
    slices.map((x) => x.days),
  )
  return slices.map((x, i) => ({ recognizeOn: x.recognizeOn, amount: amounts[i] }))
}

/**
 * A ratable line is deferred only if some of its service period is still in
 * the future on the invoice date; a period that ended already (e.g. billed
 * in arrears) is fully earned and credits Revenue directly.
 */
export function isDeferred(treatment: RevenueTreatment, invoiceDate: Date, revRecEnd: Date | undefined): boolean {
  if (treatment !== 'ratable' || !revRecEnd) return false
  return dateOnly(revRecEnd) > endOfMonth(invoiceDate)
}

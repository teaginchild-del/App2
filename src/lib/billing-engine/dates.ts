/**
 * Date-only helpers. Billing dates (order dates, due dates, service periods)
 * are calendar days, not instants, so everything here works in UTC midnight
 * to keep timezones from shifting a due date by a day.
 */

const DAY_MS = 86_400_000

export function dateOnly(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${String(d)}`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isoDate(d: Date): string {
  return dateOnly(d).toISOString().slice(0, 10)
}

/** Today's calendar date as YYYY-MM-DD (local date, not UTC). */
export function todayIso(): string {
  const now = new Date()
  return isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

export function addDays(d: Date, days: number): Date {
  return new Date(dateOnly(d).getTime() + days * DAY_MS)
}

/** Adds calendar months, clamping to the last day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(d: Date, months: number): Date {
  const base = dateOnly(d)
  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1))
  const lastDay = endOfMonth(target).getUTCDate()
  target.setUTCDate(Math.min(base.getUTCDate(), lastDay))
  return target
}

export function endOfMonth(d: Date): Date {
  const base = dateOnly(d)
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
}

export function startOfMonth(d: Date): Date {
  const base = dateOnly(d)
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1))
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / DAY_MS)
}

/** Inclusive day count of a service period [start, end]. */
export function daysInclusive(start: Date, end: Date): number {
  return daysBetween(start, end) + 1
}

export function minDate(a: Date, b: Date): Date {
  return a <= b ? a : b
}

export function maxDate(a: Date, b: Date): Date {
  return a >= b ? a : b
}

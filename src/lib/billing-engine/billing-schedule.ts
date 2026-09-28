import { addDays, addMonths, dateOnly, daysInclusive, minDate } from './dates'
import { allocate, roundCents, type Cents } from './money'

/**
 * How a sales-order line (or contract item) turns into invoices over time —
 * NetSuite's billing schedules: all at once, installments, milestones, or
 * recurring in advance / in arrears.
 */
export type BillingFrequencyMonths = 1 | 3 | 6 | 12
export type BillingTiming = 'advance' | 'arrears'

export type BillingScheduleSpec =
  /** Bill the whole line in one invoice on `billDate`. */
  | { type: 'one_time'; billDate?: string }
  /**
   * N installments every `intervalMonths`, starting `firstBillDate`. Optional
   * `weights` make them uneven (e.g. [50, 25, 25]); default is equal parts.
   */
  | {
      type: 'installments'
      count: number
      intervalMonths: number
      firstBillDate: string
      weights?: number[]
    }
  /**
   * Billed as each milestone is marked complete. Each milestone carries a
   * `percent` of the line; rounding is spread so they sum exactly.
   */
  | { type: 'milestones'; milestones: Array<{ name: string; percent: number }> }
  /**
   * Recurring billing across a service term. `advance` bills on the first day
   * of each period, `arrears` on the last. A trailing partial period is
   * prorated by days. If `amountPerPeriod` is omitted the line amount is
   * spread across the periods instead.
   */
  | {
      type: 'recurring'
      frequencyMonths: BillingFrequencyMonths
      timing: BillingTiming
      serviceStart: string
      serviceEnd: string
      amountPerPeriod?: Cents
    }

export type RecurringScheduleSpec = Extract<BillingScheduleSpec, { type: 'recurring' }>

export interface PlannedBillingEvent {
  seq: number
  /** null for milestones: the date is set when the milestone completes. */
  billDate: Date | null
  amount: Cents
  periodStart?: Date
  periodEnd?: Date
  milestoneName?: string
}

export interface ServicePeriod {
  start: Date
  end: Date
  /** 1 for a full period, < 1 for a trailing partial period. */
  fraction: number
}

/** Splits [serviceStart, serviceEnd] into billing periods of `frequencyMonths`. */
export function servicePeriods(serviceStart: Date, serviceEnd: Date, frequencyMonths: number): ServicePeriod[] {
  const start = dateOnly(serviceStart)
  const end = dateOnly(serviceEnd)
  if (end < start) throw new Error('Service end is before service start')

  const periods: ServicePeriod[] = []
  for (let i = 0; ; i++) {
    const pStart = addMonths(start, i * frequencyMonths)
    if (pStart > end) break
    const fullEnd = addDays(addMonths(start, (i + 1) * frequencyMonths), -1)
    const pEnd = minDate(fullEnd, end)
    const fraction = pEnd < fullEnd ? daysInclusive(pStart, pEnd) / daysInclusive(pStart, fullEnd) : 1
    periods.push({ start: pStart, end: pEnd, fraction })
  }
  return periods
}

/**
 * Expands a schedule spec into the concrete billing events for a line whose
 * total is `lineAmount`. For recurring with `amountPerPeriod`, `lineAmount`
 * is ignored and the total is derived from the periods (see
 * `recurringLineTotal`).
 */
export function planBillingEvents(spec: BillingScheduleSpec, lineAmount: Cents): PlannedBillingEvent[] {
  switch (spec.type) {
    case 'one_time':
      return [{ seq: 1, billDate: spec.billDate ? dateOnly(spec.billDate) : null, amount: lineAmount }]

    case 'installments': {
      if (spec.count < 1) throw new Error('Installments: count must be at least 1')
      const weights = spec.weights ?? Array(spec.count).fill(1)
      if (weights.length !== spec.count) throw new Error('Installments: weights length must equal count')
      const first = dateOnly(spec.firstBillDate)
      return allocate(lineAmount, weights).map((amount, i) => ({
        seq: i + 1,
        billDate: addMonths(first, i * spec.intervalMonths),
        amount,
      }))
    }

    case 'milestones': {
      const total = spec.milestones.reduce((a, m) => a + m.percent, 0)
      if (Math.abs(total - 100) > 1e-9) throw new Error(`Milestones: percents sum to ${total}, expected 100`)
      return allocate(
        lineAmount,
        spec.milestones.map((m) => m.percent),
      ).map((amount, i) => ({
        seq: i + 1,
        billDate: null,
        amount,
        milestoneName: spec.milestones[i].name,
      }))
    }

    case 'recurring': {
      const periods = servicePeriods(dateOnly(spec.serviceStart), dateOnly(spec.serviceEnd), spec.frequencyMonths)
      const perPeriod = spec.amountPerPeriod
      const amounts =
        perPeriod != null
          ? periods.map((p) => roundCents(perPeriod * p.fraction))
          : allocate(
              lineAmount,
              periods.map((p) => p.fraction),
            )
      return periods.map((p, i) => ({
        seq: i + 1,
        billDate: spec.timing === 'advance' ? p.start : p.end,
        amount: amounts[i],
        periodStart: p.start,
        periodEnd: p.end,
      }))
    }
  }
}

/** Total a recurring line bills over its whole term when priced per period. */
export function recurringLineTotal(spec: RecurringScheduleSpec): Cents {
  return planBillingEvents(spec, 0).reduce((a, e) => a + e.amount, 0)
}

/** Events whose bill date has arrived (milestones only once completed). */
export function dueEvents<T extends { billDate: Date | null; status: string }>(events: T[], asOf: Date): T[] {
  const cutoff = dateOnly(asOf)
  return events.filter((e) => e.status === 'pending' && e.billDate !== null && e.billDate <= cutoff)
}

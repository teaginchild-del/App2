import type { BillingFrequencyMonths, BillingTiming, RecurringScheduleSpec } from './billing-schedule'
import { addDays, addMonths, dateOnly, isoDate } from './dates'
import { extend, percentOf, type Cents } from './money'

/**
 * Contracts (NetSuite SuiteBilling / Contract Renewals): a header with the
 * customer, term dates and renewal rules, plus contract items as lines with
 * their own product, quantity, per-period price, billing frequency and
 * dates. Items bill on schedule, and at term end a renewal is generated.
 */

export interface ContractItemInput {
  productId: string | null
  description: string
  quantity: number
  /** Price per unit per billing period. */
  unitPrice: Cents
  frequencyMonths: BillingFrequencyMonths
  timing: BillingTiming
  startDate: Date
  endDate: Date
}

export interface RenewalRules {
  autoRenew: boolean
  renewalTermMonths: number
  /** Price increase applied on renewal, e.g. 3 → +3%. */
  upliftPercent: number
  /** Generate the renewal this many days before the term ends. */
  renewalLeadDays: number
}

export interface ContractTerms {
  startDate: Date
  endDate: Date
  items: ContractItemInput[]
  renewal: RenewalRules
}

export function validateContract(c: ContractTerms): void {
  if (dateOnly(c.endDate) < dateOnly(c.startDate)) throw new Error('Contract end date is before start date')
  if (c.items.length === 0) throw new Error('Contract needs at least one item')
  for (const item of c.items) {
    if (dateOnly(item.startDate) < dateOnly(c.startDate) || dateOnly(item.endDate) > dateOnly(c.endDate)) {
      throw new Error(`Item "${item.description}" dates fall outside the contract term`)
    }
    if (dateOnly(item.endDate) < dateOnly(item.startDate)) {
      throw new Error(`Item "${item.description}" ends before it starts`)
    }
    if (!(item.quantity > 0)) throw new Error(`Item "${item.description}" quantity must be positive`)
  }
}

/** The recurring billing schedule a contract item bills on. */
export function contractItemSchedule(item: ContractItemInput): RecurringScheduleSpec {
  return {
    type: 'recurring',
    frequencyMonths: item.frequencyMonths,
    timing: item.timing,
    serviceStart: isoDate(item.startDate),
    serviceEnd: isoDate(item.endDate),
    amountPerPeriod: extend(item.quantity, item.unitPrice),
  }
}

export function renewalDue(c: Pick<ContractTerms, 'endDate' | 'renewal'>, asOf: Date): boolean {
  return c.renewal.autoRenew && dateOnly(asOf) >= addDays(c.endDate, -c.renewal.renewalLeadDays)
}

/**
 * The next term: starts the day after this one ends, runs
 * `renewalTermMonths`, and carries every item still active at term end
 * forward with the uplift applied to its price.
 */
export function buildRenewal(c: ContractTerms): ContractTerms {
  const startDate = addDays(c.endDate, 1)
  const endDate = addDays(addMonths(startDate, c.renewal.renewalTermMonths), -1)
  const items = c.items
    .filter((i) => dateOnly(i.endDate).getTime() === dateOnly(c.endDate).getTime())
    .map((i) => ({
      ...i,
      unitPrice: i.unitPrice + percentOf(i.unitPrice, c.renewal.upliftPercent),
      startDate,
      endDate,
    }))
  if (items.length === 0) throw new Error('No items run to the end of the term; nothing to renew')
  return { startDate, endDate, items, renewal: c.renewal }
}

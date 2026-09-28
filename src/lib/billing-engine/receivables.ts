import { dateOnly, daysBetween } from './dates'
import { sum, type Cents } from './money'

/** Aging reports, consolidated statements, and dunning (automatic reminders). */

export interface ReceivableInvoice {
  id: string
  customerId: string
  docNumber: string | null
  invoiceDate: Date | null
  dueDate: Date | null
  total: Cents
  balance: Cents
}

export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export function daysPastDue(inv: Pick<ReceivableInvoice, 'dueDate' | 'invoiceDate'>, asOf: Date): number {
  const due = inv.dueDate ?? inv.invoiceDate
  if (!due) return 0
  return Math.max(0, daysBetween(due, asOf))
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return 'current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

export type AgingTotals = Record<AgingBucket, Cents> & { total: Cents }

function emptyTotals(): AgingTotals {
  return { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }
}

export interface AgingReport {
  asOf: Date
  byCustomer: Array<{ customerId: string; totals: AgingTotals }>
  totals: AgingTotals
}

/** A/R aging by customer on open balances as of `asOf`. */
export function agingReport(invoices: ReceivableInvoice[], asOf: Date): AgingReport {
  const byCustomer = new Map<string, AgingTotals>()
  const totals = emptyTotals()
  for (const inv of invoices) {
    if (inv.balance <= 0) continue
    const bucket = agingBucket(daysPastDue(inv, asOf))
    const c = byCustomer.get(inv.customerId) ?? emptyTotals()
    c[bucket] += inv.balance
    c.total += inv.balance
    totals[bucket] += inv.balance
    totals.total += inv.balance
    byCustomer.set(inv.customerId, c)
  }
  return {
    asOf: dateOnly(asOf),
    byCustomer: [...byCustomer.entries()]
      .map(([customerId, t]) => ({ customerId, totals: t }))
      .sort((a, b) => b.totals.total - a.totals.total),
    totals,
  }
}

export interface StatementLine {
  invoiceId: string
  docNumber: string | null
  invoiceDate: Date | null
  dueDate: Date | null
  total: Cents
  balance: Cents
  daysPastDue: number
}

export interface Statement {
  customerId: string
  asOf: Date
  lines: StatementLine[]
  aging: AgingTotals
  amountDue: Cents
  pastDue: Cents
}

/**
 * One consolidated statement for a customer with several open invoices —
 * the "invoice group" a customer can pay in one go instead of one invoice
 * at a time.
 */
export function buildStatement(customerId: string, invoices: ReceivableInvoice[], asOf: Date): Statement {
  const open = invoices
    .filter((i) => i.customerId === customerId && i.balance > 0)
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
  const lines = open.map((i) => ({
    invoiceId: i.id,
    docNumber: i.docNumber,
    invoiceDate: i.invoiceDate,
    dueDate: i.dueDate,
    total: i.total,
    balance: i.balance,
    daysPastDue: daysPastDue(i, asOf),
  }))
  const aging = agingReport(open, asOf).totals
  return {
    customerId,
    asOf: dateOnly(asOf),
    lines,
    aging,
    amountDue: sum(lines.map((l) => l.balance)),
    pastDue: sum(lines.filter((l) => l.daysPastDue > 0).map((l) => l.balance)),
  }
}

export interface DunningLevel {
  level: number
  /** Send once the invoice is at least this many days past due (negative = before due). */
  daysPastDue: number
  subject: string
  tone: 'friendly' | 'firm' | 'final'
}

export const DEFAULT_DUNNING_POLICY: DunningLevel[] = [
  { level: 1, daysPastDue: -3, subject: 'Upcoming payment reminder', tone: 'friendly' },
  { level: 2, daysPastDue: 1, subject: 'Your invoice is past due', tone: 'friendly' },
  { level: 3, daysPastDue: 15, subject: 'Second notice: invoice past due', tone: 'firm' },
  { level: 4, daysPastDue: 45, subject: 'Final notice before collections', tone: 'final' },
]

/**
 * The next reminder to send for an invoice, or null. Levels only move
 * forward (never re-send a level) and at most one step per run, so a
 * long-overdue invoice discovered late gets its highest applicable level
 * once instead of a burst of every earlier notice.
 */
export function nextDunningLevel(
  inv: Pick<ReceivableInvoice, 'dueDate' | 'invoiceDate' | 'balance'>,
  asOf: Date,
  lastLevelSent: number,
  policy: DunningLevel[] = DEFAULT_DUNNING_POLICY,
): DunningLevel | null {
  if (inv.balance <= 0) return null
  const due = inv.dueDate ?? inv.invoiceDate
  if (!due) return null
  const days = daysBetween(due, asOf)
  const applicable = policy.filter((p) => days >= p.daysPastDue && p.level > lastLevelSent)
  if (applicable.length === 0) return null
  return applicable.reduce((a, b) => (b.level > a.level ? b : a))
}

import { dateOnly, daysBetween, isoDate } from './dates'
import { sum, type Cents } from './money'

/**
 * Bank deposits and reconciliation. Receipts first land in an "undeposited
 * funds" holding account; a bank deposit groups the receipts that arrived
 * together (one day's checks, one Stripe payout) into the single amount that
 * shows up as one line on the bank statement. Reconciliation then matches
 * those deposits to the imported statement lines.
 */

export type ReceiptMethod = 'check' | 'cash' | 'ach' | 'wire' | 'card' | 'stripe'

export type BankDepositSource = 'stripe_payout' | 'check_batch' | 'individual'

export interface UndepositedReceipt {
  id: string
  /** Customer payment or customer deposit — both sit in undeposited funds. */
  kind: 'payment' | 'deposit'
  amount: Cents
  receivedOn: Date
  method: ReceiptMethod
  /** Stripe receipts are grouped by the payout that swept them to the bank. */
  stripePayoutId?: string | null
}

export interface ProposedBankDeposit {
  key: string
  depositDate: Date
  amount: Cents
  receiptIds: string[]
  source: BankDepositSource
  stripePayoutId?: string
}

/**
 * Proposes bank deposits from undeposited receipts:
 *  - Stripe/card receipts: one deposit per payout (receipts not yet in a
 *    payout are still in transit and are left undeposited).
 *  - Checks and cash: one deposit per day — the day's batch taken to the bank.
 *  - ACH and wire: one deposit each; they post to the bank individually.
 */
export function proposeBankDeposits(receipts: UndepositedReceipt[]): ProposedBankDeposit[] {
  const groups = new Map<string, ProposedBankDeposit>()
  const add = (
    key: string,
    r: UndepositedReceipt,
    init: Omit<ProposedBankDeposit, 'amount' | 'receiptIds' | 'key'>,
  ) => {
    const g = groups.get(key) ?? { key, amount: 0, receiptIds: [], ...init }
    g.amount += r.amount
    g.receiptIds.push(r.id)
    if (r.receivedOn > g.depositDate) g.depositDate = dateOnly(r.receivedOn)
    groups.set(key, g)
  }

  for (const r of receipts) {
    if (r.method === 'stripe' || r.method === 'card') {
      if (!r.stripePayoutId) continue
      add(`payout:${r.stripePayoutId}`, r, {
        depositDate: dateOnly(r.receivedOn),
        source: 'stripe_payout',
        stripePayoutId: r.stripePayoutId,
      })
    } else if (r.method === 'check' || r.method === 'cash') {
      add(`batch:${isoDate(r.receivedOn)}`, r, { depositDate: dateOnly(r.receivedOn), source: 'check_batch' })
    } else {
      add(`single:${r.id}`, r, { depositDate: dateOnly(r.receivedOn), source: 'individual' })
    }
  }
  return [...groups.values()].sort((a, b) => a.depositDate.getTime() - b.depositDate.getTime())
}

export interface BankDepositRecord {
  id: string
  depositDate: Date
  amount: Cents
  /** e.g. the Stripe payout ID, which Stripe puts in the bank line's description. */
  reference?: string | null
}

export interface BankStatementEntry {
  id: string
  postedOn: Date
  amount: Cents
  description: string
}

export type MatchRule = 'reference' | 'amount_and_date' | 'manual'

export interface ReconciliationMatch {
  statementLineId: string
  depositId: string
  rule: MatchRule
}

export interface ReconciliationResult {
  matches: ReconciliationMatch[]
  unmatchedLines: BankStatementEntry[]
  unmatchedDeposits: BankDepositRecord[]
}

/**
 * Matches bank statement credits to recorded bank deposits.
 *  1. Reference: amount equal and the deposit's reference appears in the line
 *     description (Stripe payouts carry the payout ID) — unambiguous.
 *  2. Amount + date: amount equal and posted within `dateWindowDays` of the
 *     deposit date. Only accepted when exactly one candidate is closest, so
 *     two identical $500.00 deposits a day apart are left for a human rather
 *     than guessed.
 */
export function reconcile(
  lines: BankStatementEntry[],
  deposits: BankDepositRecord[],
  opts: { dateWindowDays?: number } = {},
): ReconciliationResult {
  const window = opts.dateWindowDays ?? 5
  const credits = lines.filter((l) => l.amount > 0)
  const openDeposits = new Map(deposits.map((d) => [d.id, d]))
  const matchedLines = new Set<string>()
  const matches: ReconciliationMatch[] = []

  for (const line of credits) {
    const desc = line.description.toLowerCase()
    const hit = [...openDeposits.values()].find(
      (d) => d.amount === line.amount && d.reference && desc.includes(d.reference.toLowerCase()),
    )
    if (hit) {
      matches.push({ statementLineId: line.id, depositId: hit.id, rule: 'reference' })
      matchedLines.add(line.id)
      openDeposits.delete(hit.id)
    }
  }

  for (const line of credits) {
    if (matchedLines.has(line.id)) continue
    const candidates = [...openDeposits.values()]
      .filter((d) => d.amount === line.amount)
      .map((d) => ({ d, gap: Math.abs(daysBetween(d.depositDate, line.postedOn)) }))
      .filter((c) => c.gap <= window)
      .sort((a, b) => a.gap - b.gap)
    if (candidates.length === 0) continue
    if (candidates.length > 1 && candidates[0].gap === candidates[1].gap) continue
    const best = candidates[0].d
    matches.push({ statementLineId: line.id, depositId: best.id, rule: 'amount_and_date' })
    matchedLines.add(line.id)
    openDeposits.delete(best.id)
  }

  return {
    matches,
    unmatchedLines: credits.filter((l) => !matchedLines.has(l.id)),
    unmatchedDeposits: [...openDeposits.values()],
  }
}

/**
 * For a statement line with no recorded deposit, finds a set of undeposited
 * receipts that adds up to it exactly (e.g. three checks deposited together
 * but never grouped in the app). Bounded search over receipts received
 * within the date window; returns null if nothing fits.
 */
export function suggestReceiptsForLine(
  line: BankStatementEntry,
  receipts: UndepositedReceipt[],
  opts: { dateWindowDays?: number; maxCandidates?: number } = {},
): string[] | null {
  const window = opts.dateWindowDays ?? 5
  const candidates = receipts
    .filter((r) => r.amount > 0 && r.amount <= line.amount)
    .filter((r) => {
      const gap = daysBetween(r.receivedOn, line.postedOn)
      return gap >= 0 && gap <= window
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, opts.maxCandidates ?? 20)

  if (sum(candidates.map((c) => c.amount)) < line.amount) return null

  const chosen: string[] = []
  const search = (start: number, remaining: Cents): boolean => {
    if (remaining === 0) return true
    for (let i = start; i < candidates.length; i++) {
      if (candidates[i].amount > remaining) continue
      chosen.push(candidates[i].id)
      if (search(i + 1, remaining - candidates[i].amount)) return true
      chosen.pop()
    }
    return false
  }
  return search(0, line.amount) ? chosen : null
}

/** Parses a bank statement CSV amount like "1,234.56", "(12.00)" or "-12.00" into cents. */
export function parseStatementAmount(raw: string): Cents {
  const trimmed = raw.trim().replace(/[$,\s]/g, '')
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-')
  const n = Number(trimmed.replace(/[()-]/g, ''))
  if (!Number.isFinite(n) || trimmed === '') throw new Error(`Unparseable amount: "${raw}"`)
  return Math.round(n * 100) * (negative ? -1 : 1)
}

export interface ParsedStatementRow {
  externalId: string
  postedOn: string
  amount: Cents
  description: string
}

/**
 * Parses a bank statement / bank feed CSV export. Accepts the common column
 * layouts: Date + Amount (signed) or Date + Credit/Debit, plus
 * Description/Memo and an optional transaction ID. Rows without a bank ID
 * are keyed by their content, so re-importing the same file is a no-op
 * (and two identical rows on one day stay two transactions).
 */
export function parseStatementCsv(csv: string): ParsedStatementRow[] {
  const rows = parseCsv(csv)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (names: string[]) => header.findIndex((h) => names.includes(h))
  const dateCol = col(['date', 'posted', 'posted date', 'posting date', 'transaction date'])
  const descCol = col(['description', 'memo', 'payee', 'details', 'name'])
  const amountCol = col(['amount'])
  const creditCol = col(['credit', 'deposit', 'deposits'])
  const debitCol = col(['debit', 'withdrawal', 'withdrawals'])
  const idCol = col(['id', 'transaction id', 'fitid', 'reference'])
  if (dateCol < 0) throw new Error('Statement CSV needs a Date column')
  if (amountCol < 0 && creditCol < 0 && debitCol < 0)
    throw new Error('Statement CSV needs an Amount or Credit/Debit column')

  const seen = new Map<string, number>()
  const out: ParsedStatementRow[] = []
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim() === '')) continue
    const cell = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')
    const date = cell(dateCol)
    const description = cell(descCol)
    const amount =
      amountCol >= 0 && cell(amountCol)
        ? parseStatementAmount(cell(amountCol))
        : (cell(creditCol) ? parseStatementAmount(cell(creditCol)) : 0) -
          (cell(debitCol) ? Math.abs(parseStatementAmount(cell(debitCol))) : 0)
    const postedOn = isoDate(new Date(date.length === 10 && /^\d{4}-/.test(date) ? `${date}T00:00:00Z` : `${date} UTC`))

    const base = cell(idCol) || `${postedOn}|${amount}|${description}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ externalId: n === 1 ? base : `${base}#${n}`, postedOn, amount, description })
  }
  return out
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

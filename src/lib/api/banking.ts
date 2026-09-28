import { supabase } from '@/lib/supabase'
import {
  dateOnly,
  isoDate,
  parseStatementCsv,
  proposeBankDeposits,
  reconcile,
  suggestReceiptsForLine,
  type BankDepositSource,
  type MatchRule,
  type ProposedBankDeposit,
  type ReceiptMethod,
  type UndepositedReceipt,
} from '@/lib/billing-engine'
import { rpc, str, type Row } from '@/lib/api/o2c-shared'
import type { BankDeposit, BankStatementLine } from '@/types/order-to-cash'

/**
 * Bank deposits + reconciliation. Receipt ids are namespaced
 * ("payment:<id>", "deposit:<id>") because one bank deposit can mix
 * customer payments and customer deposits.
 */

export interface ReceiptView extends UndepositedReceipt {
  customerName: string
  reference: string | null
}

export async function listUndepositedReceipts(): Promise<ReceiptView[]> {
  const [payments, deposits] = await Promise.all([
    supabase
      .from('customer_payments')
      .select('id, received_on, amount_cents, method, reference, stripe_payout_id, customer:customers(company_name)')
      .is('bank_deposit_id', null),
    supabase
      .from('customer_deposits')
      .select('id, received_on, amount_cents, method, reference, stripe_payout_id, customer:customers(company_name)')
      .is('bank_deposit_id', null),
  ])
  if (payments.error) throw payments.error
  if (deposits.error) throw deposits.error

  const view = (kind: 'payment' | 'deposit') => (r: Row) => ({
    id: `${kind}:${r.id as string}`,
    kind,
    amount: r.amount_cents as number,
    receivedOn: dateOnly(r.received_on as string),
    method: r.method as ReceiptMethod,
    stripePayoutId: str(r.stripe_payout_id),
    customerName: ((r.customer as Row | null)?.company_name as string) ?? '',
    reference: str(r.reference),
  })
  return [...(payments.data ?? []).map(view('payment')), ...(deposits.data ?? []).map(view('deposit'))].sort(
    (a, b) => a.receivedOn.getTime() - b.receivedOn.getTime(),
  )
}

export function proposeDeposits(receipts: ReceiptView[]): ProposedBankDeposit[] {
  return proposeBankDeposits(receipts)
}

function splitIds(receiptIds: string[]) {
  const paymentIds: string[] = []
  const depositIds: string[] = []
  for (const id of receiptIds) {
    const [kind, raw] = id.split(':')
    if (kind === 'payment' && raw) paymentIds.push(raw)
    else if (kind === 'deposit' && raw) depositIds.push(raw)
    else throw new Error(`Bad receipt id "${id}"`)
  }
  return { paymentIds, depositIds }
}

/** Groups receipts into one bank deposit (undeposited funds → bank). */
export async function createBankDeposit(
  receipts: ReceiptView[],
  opts: { depositDate?: string; reference?: string } = {},
): Promise<string> {
  if (receipts.length === 0) throw new Error('Pick at least one receipt')
  const methods = new Set(receipts.map((r) => r.method))
  const payouts = new Set(receipts.map((r) => r.stripePayoutId).filter(Boolean))
  const isStripe = [...methods].every((m) => m === 'stripe' || m === 'card')
  if (isStripe && payouts.size > 1) throw new Error('Stripe receipts from different payouts go in separate deposits')
  const source: BankDepositSource = isStripe
    ? 'stripe_payout'
    : [...methods].every((m) => m === 'check' || m === 'cash')
      ? 'check_batch'
      : 'individual'
  const latest = receipts.reduce((a, r) => (r.receivedOn > a ? r.receivedOn : a), receipts[0].receivedOn)
  const stripePayoutId = isStripe ? ([...payouts][0] ?? null) : null

  return rpc<string>('o2c_create_bank_deposit', {
    p_deposit: {
      ...splitIds(receipts.map((r) => r.id)),
      depositDate: opts.depositDate || isoDate(latest),
      source,
      stripePayoutId,
      reference: opts.reference || stripePayoutId,
    },
  })
}

export async function listBankDeposits(): Promise<BankDeposit[]> {
  const { data, error } = await supabase
    .from('bank_deposits')
    .select('*, bank_statement_lines(id)')
    .order('deposit_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => {
    // bank_deposit_id is unique on statement lines, so PostgREST may embed an object rather than an array.
    const linked = r.bank_statement_lines as Row | Row[] | null
    return {
      id: r.id as string,
      depositDate: r.deposit_date as string,
      amountCents: r.amount_cents as number,
      source: r.source as BankDepositSource,
      stripePayoutId: str(r.stripe_payout_id),
      reference: str(r.reference),
      createdAt: r.created_at as string,
      matched: Array.isArray(linked) ? linked.length > 0 : linked != null,
    }
  })
}

function mapStatementLine(r: Row): BankStatementLine {
  return {
    id: r.id as string,
    postedOn: r.posted_on as string,
    amountCents: r.amount_cents as number,
    description: r.description as string,
    externalId: r.external_id as string,
    status: r.status as BankStatementLine['status'],
    bankDepositId: str(r.bank_deposit_id),
    matchRule: str(r.match_rule) as MatchRule | null,
    matchedAt: str(r.matched_at),
  }
}

export async function listStatementLines(): Promise<BankStatementLine[]> {
  const { data, error } = await supabase
    .from('bank_statement_lines')
    .select('*')
    .order('posted_on', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapStatementLine)
}

/** Imports a bank statement CSV. Re-importing the same file is a no-op. */
export async function importStatementCsv(csv: string): Promise<{ rows: number; imported: number }> {
  const rows = parseStatementCsv(csv)
  if (rows.length === 0) return { rows: 0, imported: 0 }
  const { data, error } = await supabase
    .from('bank_statement_lines')
    .upsert(
      rows.map((r) => ({
        external_id: r.externalId,
        posted_on: r.postedOn,
        amount_cents: r.amount,
        description: r.description,
      })),
      { onConflict: 'external_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw error
  return { rows: rows.length, imported: data?.length ?? 0 }
}

export interface ReconcileSuggestion {
  statementLineId: string
  receiptIds: string[]
}

export interface ReconcileResult {
  matched: number
  failed: string[]
  suggestions: ReconcileSuggestion[]
}

/** Auto-matches statement credits to bank deposits and suggests groupings for the rest. */
export async function autoReconcile(opts: { dateWindowDays?: number } = {}): Promise<ReconcileResult> {
  const [lines, deposits, receipts] = await Promise.all([
    listStatementLines(),
    listBankDeposits(),
    listUndepositedReceipts(),
  ])
  const unmatchedLines = lines.filter((l) => l.status === 'unmatched')
  const result = reconcile(
    unmatchedLines.map((l) => ({
      id: l.id,
      postedOn: dateOnly(l.postedOn),
      amount: l.amountCents,
      description: l.description,
    })),
    deposits
      .filter((d) => !d.matched)
      .map((d) => ({
        id: d.id,
        depositDate: dateOnly(d.depositDate),
        amount: d.amountCents,
        reference: d.stripePayoutId ?? d.reference,
      })),
    opts,
  )

  let matched = 0
  const failed: string[] = []
  for (const m of result.matches) {
    try {
      await matchStatementLine(m.statementLineId, m.depositId, m.rule)
      matched++
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err))
    }
  }

  const suggestions = result.unmatchedLines
    .map((line) => ({ statementLineId: line.id, receiptIds: suggestReceiptsForLine(line, receipts, opts) }))
    .filter((s): s is ReconcileSuggestion => s.receiptIds !== null)
  return { matched, failed, suggestions }
}

export async function matchStatementLine(statementLineId: string, bankDepositId: string, rule: MatchRule = 'manual') {
  await rpc('o2c_match_statement_line', {
    p_line_id: statementLineId,
    p_bank_deposit_id: bankDepositId,
    p_rule: rule,
  })
}

/** Statement lines that aren't customer receipts (fees, transfers) are set aside. */
export async function ignoreStatementLine(statementLineId: string): Promise<void> {
  const { data, error } = await supabase
    .from('bank_statement_lines')
    .update({ status: 'ignored' })
    .eq('id', statementLineId)
    .eq('status', 'unmatched')
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Unmatched statement line not found')
}

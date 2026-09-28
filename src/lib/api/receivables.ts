import { supabase } from '@/lib/supabase'
import {
  agingReport,
  buildStatement,
  dateOnly,
  nextDunningLevel,
  type AgingReport,
  type ReceivableInvoice,
  type Statement,
} from '@/lib/billing-engine'
import { str, type Row } from '@/lib/api/o2c-shared'
import type { DunningNotice, RevRecEntry } from '@/types/order-to-cash'

/** Aging, consolidated statements, dunning and revenue recognition. */

interface OpenReceivable extends ReceivableInvoice {
  customerName: string
  customerEmail: string | null
  dunningLevel: number
  dunningPaused: boolean
}

async function openReceivables(customerId?: string): Promise<OpenReceivable[]> {
  let query = supabase
    .from('invoices')
    .select(
      'id, customer_id, invoice_number, issue_date, due_date, total_cents, balance_cents, dunning_level, dunning_paused, customer:customers(company_name, email)',
    )
    .in('status', ['open', 'partially_paid'])
    .gt('balance_cents', 0)
  if (customerId) query = query.eq('customer_id', customerId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r) => {
    const customer = r.customer as unknown as Row | null
    return {
      id: r.id as string,
      customerId: r.customer_id as string,
      docNumber: str(r.invoice_number),
      invoiceDate: r.issue_date ? dateOnly(r.issue_date as string) : null,
      dueDate: r.due_date ? dateOnly(r.due_date as string) : null,
      total: r.total_cents as number,
      balance: r.balance_cents as number,
      customerName: (customer?.company_name as string) ?? '',
      customerEmail: str(customer?.email),
      dunningLevel: r.dunning_level as number,
      dunningPaused: r.dunning_paused as boolean,
    }
  })
}

export interface AgingView extends AgingReport {
  customerNames: Map<string, string>
}

export async function getAgingReport(asOf: string): Promise<AgingView> {
  const open = await openReceivables()
  return {
    ...agingReport(open, dateOnly(asOf)),
    customerNames: new Map(open.map((i) => [i.customerId, i.customerName])),
  }
}

export async function getStatement(customerId: string, asOf: string): Promise<Statement> {
  return buildStatement(customerId, await openReceivables(customerId), dateOnly(asOf))
}

export interface DunningRunResult {
  queued: number
  skippedNoEmail: number
}

/**
 * Dunning run: queues each overdue invoice's next reminder level. The notice
 * row is unique per invoice + level, so overlapping runs can't queue a level
 * twice, and the invoice's level only ever moves forward. Queued notices are
 * delivered from the Receivables screen (email integration or mail client).
 */
export async function runDunning(asOf: string): Promise<DunningRunResult> {
  const today = dateOnly(asOf)
  const result: DunningRunResult = { queued: 0, skippedNoEmail: 0 }

  for (const inv of await openReceivables()) {
    if (inv.dunningPaused) continue
    const level = nextDunningLevel(inv, today, inv.dunningLevel)
    if (!level) continue
    if (!inv.customerEmail) {
      result.skippedNoEmail++
      continue
    }

    const { error } = await supabase.from('dunning_notices').insert({
      invoice_id: inv.id,
      level: level.level,
      subject: `${level.subject} — invoice ${inv.docNumber ?? ''}`.trim(),
      sent_to: inv.customerEmail,
    })
    // 23505 = unique violation: another run already queued this level.
    if (error && error.code !== '23505') throw error
    if (!error) result.queued++

    const { error: levelError } = await supabase
      .from('invoices')
      .update({ dunning_level: level.level })
      .eq('id', inv.id)
      .lt('dunning_level', level.level)
    if (levelError) throw levelError
  }
  return result
}

export async function listDunningNotices(): Promise<DunningNotice[]> {
  const { data, error } = await supabase
    .from('dunning_notices')
    .select('*, invoice:invoices(invoice_number, balance_cents, customer:customers(company_name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => {
    const invoice = r.invoice as Row
    return {
      id: r.id as string,
      invoiceId: r.invoice_id as string,
      invoiceNumber: invoice.invoice_number as string,
      customerName: ((invoice.customer as Row | null)?.company_name as string) ?? '',
      level: r.level as number,
      subject: r.subject as string,
      sentTo: str(r.sent_to),
      deliveryStatus: r.delivery_status as DunningNotice['deliveryStatus'],
      createdAt: r.created_at as string,
      sentAt: str(r.sent_at),
      balanceCents: invoice.balance_cents as number,
    }
  })
}

export async function markNoticeSent(noticeId: string): Promise<void> {
  const { error } = await supabase
    .from('dunning_notices')
    .update({ delivery_status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', noticeId)
  if (error) throw error
}

export async function listRevRecEntries(): Promise<RevRecEntry[]> {
  const { data, error } = await supabase
    .from('rev_rec_entries')
    .select(
      '*, line:invoice_line_items(description, invoice:invoices(id, invoice_number, status, customer:customers(company_name)))',
    )
    .order('recognize_on', { ascending: true })
  if (error) throw error
  return (data ?? [])
    .filter((r) => ((r.line as Row).invoice as Row).status !== 'void')
    .map((r) => {
      const line = r.line as Row
      const invoice = line.invoice as Row
      return {
        id: r.id as string,
        invoiceLineItemId: r.invoice_line_item_id as string,
        recognizeOn: r.recognize_on as string,
        amountCents: r.amount_cents as number,
        recognizedAt: str(r.recognized_at),
        invoiceId: invoice.id as string,
        invoiceNumber: invoice.invoice_number as string,
        customerName: ((invoice.customer as Row | null)?.company_name as string) ?? '',
        description: line.description as string,
      }
    })
}

/**
 * Releases deferred revenue earned through `asOf` (Dr Deferred Revenue /
 * Cr Revenue). Idempotent: already-recognized entries are left alone.
 */
export async function recognizeRevenue(asOf: string): Promise<{ entries: number; amountCents: number }> {
  const { data, error } = await supabase
    .from('rev_rec_entries')
    .update({ recognized_at: new Date().toISOString() })
    .is('recognized_at', null)
    .lte('recognize_on', asOf)
    .select('amount_cents')
  if (error) throw error
  return {
    entries: data?.length ?? 0,
    amountCents: (data ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0),
  }
}

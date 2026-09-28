import { runContractRenewals } from '@/lib/api/contracts'
import { runScheduledBilling } from '@/lib/api/invoicing'
import { recognizeRevenue, runDunning } from '@/lib/api/receivables'
import { formatCents } from '@/lib/format'

export interface BillingRunStep {
  name: string
  ok: boolean
  summary: string
}

/**
 * The daily order-to-cash sweep, in dependency order: renew contracts
 * (which creates renewal orders), bill everything due, recognize revenue
 * earned to date, then queue reminders for overdue balances. Each step is
 * idempotent and isolated — one failing doesn't stop the rest. Triggered
 * from the Billing Run screen; a scheduled job (e.g. Supabase cron / edge
 * function) can call the same steps once a backend exists.
 */
export async function runBillingEngine(asOf: string): Promise<BillingRunStep[]> {
  const steps: Array<[string, () => Promise<string>]> = [
    [
      'Contract renewals',
      async () => {
        const r = await runContractRenewals(asOf)
        const failed = r.failed.map((f) => `${f.contractNumber}: ${f.error}`)
        return [`${r.renewed.length} renewal(s) created`, `${r.expired} expired`, ...failed].join(' · ')
      },
    ],
    [
      'Scheduled billing',
      async () => {
        const r = await runScheduledBilling(asOf)
        const failed = r.failed.map((f) => `${f.orderNumber}: ${f.error}`)
        return [`${r.billed} invoice(s) created`, ...failed].join(' · ')
      },
    ],
    [
      'Revenue recognition',
      async () => {
        const r = await recognizeRevenue(asOf)
        return `${r.entries} schedule line(s) recognized (${formatCents(r.amountCents)})`
      },
    ],
    [
      'Dunning',
      async () => {
        const r = await runDunning(asOf)
        return `${r.queued} reminder(s) queued${r.skippedNoEmail ? ` · ${r.skippedNoEmail} skipped (no email on file)` : ''}`
      },
    ],
  ]

  const results: BillingRunStep[] = []
  for (const [name, step] of steps) {
    try {
      results.push({ name, ok: true, summary: await step() })
    } catch (err) {
      results.push({ name, ok: false, summary: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

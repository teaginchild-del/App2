import { AlertTriangle, BellRing, Mail, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorBanner, KeyValue, NoticeBanner, Section, SimpleTable, Td } from '@/components/order-to-cash/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { getAgingReport, getStatement, listDunningNotices, markNoticeSent, runDunning } from '@/lib/api/receivables'
import { AGING_BUCKETS, isoDate, todayIso, type Statement } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'
import type { DunningNotice } from '@/types/order-to-cash'

const BUCKET_LABELS: Record<(typeof AGING_BUCKETS)[number], string> = {
  current: 'Current',
  '1-30': '1–30',
  '31-60': '31–60',
  '61-90': '61–90',
  '90+': '90+',
}

function reminderMailto(n: DunningNotice): string {
  const body = `Hi ${n.customerName},\n\nThis is a reminder that invoice ${n.invoiceNumber} has a balance of ${formatCents(n.balanceCents)}.\n\nThank you.`
  return `mailto:${encodeURIComponent(n.sentTo ?? '')}?subject=${encodeURIComponent(n.subject)}&body=${encodeURIComponent(body)}`
}

export function Receivables() {
  const [asOf, setAsOf] = useState(todayIso())
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([getAgingReport(asOf), listDunningNotices()]),
    [asOf],
  )
  const [statement, setStatement] = useState<{ name: string; statement: Statement } | null>(null)
  const action = useAction()
  const [dunningResult, setDunningResult] = useState<string | null>(null)

  const [aging, notices] = data ?? [null, []]
  const pastDue = aging ? aging.totals.total - aging.totals.current : 0
  const queued = notices.filter((n) => n.deliveryStatus === 'queued')

  const openStatement = async (customerId: string) => {
    await action.run(async () => {
      setStatement({
        name: aging?.customerNames.get(customerId) ?? '',
        statement: await getStatement(customerId, asOf),
      })
    })
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="Receivables"
        description="A/R aging, customer statements, and payment reminders."
        actions={
          <>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
            <Button
              size="sm"
              onClick={async () => {
                let summary = ''
                const ok = await action.run(async () => {
                  const r = await runDunning(asOf)
                  summary = `${r.queued} reminder(s) queued${r.skippedNoEmail ? `, ${r.skippedNoEmail} skipped (no email on file)` : ''}.`
                })
                if (ok) {
                  setDunningResult(summary)
                  await reload()
                }
              }}
              disabled={action.pending}
            >
              <BellRing className="h-4 w-4" />
              Run dunning
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Open A/R" value={formatCents(aging?.totals.total ?? 0)} icon={Wallet} />
        <StatCard
          label="Past Due"
          value={formatCents(pastDue)}
          icon={AlertTriangle}
          tone={pastDue ? 'danger' : 'default'}
        />
        <StatCard label="Reminders to Send" value={queued.length.toString()} icon={Mail} />
      </div>

      <div className="space-y-6 px-6 pb-6">
        <ErrorBanner message={error ?? action.error} />
        {dunningResult && <NoticeBanner>{dunningResult}</NoticeBanner>}

        <Section title={`A/R aging as of ${formatDate(asOf)}`} flush>
          {loading && !data ? (
            <div className="px-5 py-6 text-sm text-ink-muted">Loading...</div>
          ) : (
            <SimpleTable
              head={['Customer', ...AGING_BUCKETS.map((b) => BUCKET_LABELS[b]), 'Total', '']}
              empty={aging?.byCustomer.length === 0 && 'No open receivables.'}
            >
              {aging?.byCustomer.map((row) => (
                <tr key={row.customerId}>
                  <Td className="font-medium">{aging.customerNames.get(row.customerId)}</Td>
                  {AGING_BUCKETS.map((b) => (
                    <Td key={b} className={b !== 'current' && row.totals[b] ? 'text-danger-700' : ''}>
                      {row.totals[b] ? formatCents(row.totals[b]) : '—'}
                    </Td>
                  ))}
                  <Td className="font-semibold">{formatCents(row.totals.total)}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openStatement(row.customerId)}>
                      Statement
                    </Button>
                  </Td>
                </tr>
              ))}
              {aging && aging.byCustomer.length > 0 && (
                <tr className="bg-slate-50">
                  <Td className="font-semibold">Total</Td>
                  {AGING_BUCKETS.map((b) => (
                    <Td key={b} className="font-semibold">
                      {formatCents(aging.totals[b])}
                    </Td>
                  ))}
                  <Td className="font-semibold">{formatCents(aging.totals.total)}</Td>
                  <Td />
                </tr>
              )}
            </SimpleTable>
          )}
        </Section>

        {statement && (
          <Section
            title={`Statement — ${statement.name}`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setStatement(null)}>
                Close
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SimpleTable head={['Invoice', 'Date', 'Due', 'Days past due', 'Total', 'Balance']}>
                  {statement.statement.lines.map((l) => (
                    <tr key={l.invoiceId}>
                      <Td>
                        <Link className="text-brand-600 hover:underline" to={`/invoices/${l.invoiceId}`}>
                          {l.docNumber}
                        </Link>
                      </Td>
                      <Td>{l.invoiceDate ? formatDate(isoDate(l.invoiceDate)) : '—'}</Td>
                      <Td>{l.dueDate ? formatDate(isoDate(l.dueDate)) : '—'}</Td>
                      <Td className={l.daysPastDue ? 'text-danger-700' : ''}>{l.daysPastDue || '—'}</Td>
                      <Td>{formatCents(l.total)}</Td>
                      <Td>{formatCents(l.balance)}</Td>
                    </tr>
                  ))}
                </SimpleTable>
              </div>
              <div>
                <KeyValue label="Amount due" value={formatCents(statement.statement.amountDue)} tone="strong" />
                <KeyValue
                  label="Past due"
                  value={formatCents(statement.statement.pastDue)}
                  tone={statement.statement.pastDue ? 'danger' : undefined}
                />
                <p className="mt-3 text-xs text-ink-subtle">
                  One consolidated statement the customer can pay in a single payment — record it with “Receive payment”
                  and it applies oldest invoice first.
                </p>
              </div>
            </div>
          </Section>
        )}

        <Section title="Payment reminders" flush>
          <SimpleTable
            head={['Queued', 'Invoice', 'Customer', 'Level', 'Subject', 'To', 'Status', '']}
            empty={notices.length === 0 && 'No reminders yet. Run dunning to queue them.'}
          >
            {notices.map((n) => (
              <tr key={n.id}>
                <Td>{formatDate(n.createdAt.slice(0, 10))}</Td>
                <Td>
                  <Link className="text-brand-600 hover:underline" to={`/invoices/${n.invoiceId}`}>
                    {n.invoiceNumber}
                  </Link>
                </Td>
                <Td>{n.customerName}</Td>
                <Td>{n.level}</Td>
                <Td>{n.subject}</Td>
                <Td className="text-ink-muted">{n.sentTo}</Td>
                <Td>
                  {n.deliveryStatus === 'sent' ? `Sent ${n.sentAt ? formatDate(n.sentAt.slice(0, 10)) : ''}` : 'Queued'}
                </Td>
                <Td className="text-right">
                  {n.deliveryStatus === 'queued' && (
                    <span className="flex justify-end gap-1">
                      <a
                        href={reminderMailto(n)}
                        className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-brand-600 hover:bg-brand-50"
                      >
                        Compose
                      </a>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (await action.run(() => markNoticeSent(n.id))) await reload()
                        }}
                      >
                        Mark sent
                      </Button>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </SimpleTable>
        </Section>
      </div>
    </div>
  )
}

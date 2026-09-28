import { CalendarCheck, Hourglass, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorBanner, NoticeBanner, Section, SimpleTable, Td } from '@/components/order-to-cash/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { listRevRecEntries, recognizeRevenue } from '@/lib/api/receivables'
import { todayIso } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function Revenue() {
  const { data, loading, error, reload } = useAsync(listRevRecEntries, [])
  const [asOf, setAsOf] = useState(todayIso())
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()
  const entries = useMemo(() => data ?? [], [data])

  const { deferred, dueNow, recognized, waterfall } = useMemo(() => {
    const open = entries.filter((e) => !e.recognizedAt)
    const byMonth = new Map<string, number>()
    for (const e of open)
      byMonth.set(e.recognizeOn.slice(0, 7), (byMonth.get(e.recognizeOn.slice(0, 7)) ?? 0) + e.amountCents)
    return {
      deferred: open.reduce((sum, e) => sum + e.amountCents, 0),
      dueNow: open.filter((e) => e.recognizeOn <= asOf).reduce((sum, e) => sum + e.amountCents, 0),
      recognized: entries.filter((e) => e.recognizedAt).reduce((sum, e) => sum + e.amountCents, 0),
      waterfall: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }
  }, [entries, asOf])

  const max = Math.max(1, ...waterfall.map(([, v]) => v))

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="Revenue Recognition"
        description="Deferred revenue from ratable invoice lines, released month by month as it is earned."
        actions={
          <>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
            <Button
              size="sm"
              disabled={action.pending || dueNow === 0}
              onClick={async () => {
                let summary = ''
                const ok = await action.run(async () => {
                  const r = await recognizeRevenue(asOf)
                  summary = `Recognized ${formatCents(r.amountCents)} across ${r.entries} schedule line(s) (Dr Deferred Revenue / Cr Revenue).`
                })
                if (ok) {
                  setNotice(summary)
                  await reload()
                }
              }}
            >
              <CalendarCheck className="h-4 w-4" />
              Recognize through {formatDate(asOf)}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Deferred Revenue Balance" value={formatCents(deferred)} icon={Hourglass} />
        <StatCard
          label={`Earned by ${formatDate(asOf)}, not yet recognized`}
          value={formatCents(dueNow)}
          icon={CalendarCheck}
          tone={dueNow ? 'danger' : 'default'}
        />
        <StatCard label="Recognized to Date" value={formatCents(recognized)} icon={TrendingUp} tone="success" />
      </div>

      <div className="space-y-6 px-6 pb-6">
        <ErrorBanner message={error ?? action.error} />
        {notice && <NoticeBanner>{notice}</NoticeBanner>}
        {loading && !data && <div className="text-sm text-ink-muted">Loading...</div>}

        <Section title="Deferred revenue waterfall">
          {waterfall.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              No deferred revenue. Ratable lines billed ahead of their service period appear here.
            </p>
          ) : (
            <div className="space-y-1.5">
              {waterfall.map(([month, cents]) => (
                <div key={month} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-ink-muted">{monthLabel(month)}</span>
                  <div className="h-4 flex-1 rounded bg-slate-100">
                    <div className="h-4 rounded bg-brand-500" style={{ width: `${(cents / max) * 100}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums">{formatCents(cents)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Schedule" flush>
          <SimpleTable
            head={['Recognize on', 'Invoice', 'Customer', 'Line', 'Amount', 'Status']}
            empty={entries.length === 0 && 'No revenue schedules yet.'}
          >
            {entries.map((e) => (
              <tr key={e.id}>
                <Td>{formatDate(e.recognizeOn)}</Td>
                <Td>
                  <Link className="text-brand-600 hover:underline" to={`/invoices/${e.invoiceId}`}>
                    {e.invoiceNumber}
                  </Link>
                </Td>
                <Td>{e.customerName}</Td>
                <Td className="text-ink-muted">{e.description}</Td>
                <Td>{formatCents(e.amountCents)}</Td>
                <Td>{e.recognizedAt ? 'Recognized' : e.recognizeOn <= asOf ? 'Due' : 'Deferred'}</Td>
              </tr>
            ))}
          </SimpleTable>
        </Section>
      </div>
    </div>
  )
}

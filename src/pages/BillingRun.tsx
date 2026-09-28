import { CheckCircle2, PlayCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorBanner, Field, Section } from '@/components/order-to-cash/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { runBillingEngine, type BillingRunStep } from '@/lib/api/billing-run'
import { todayIso } from '@/lib/billing-engine'
import { formatDate } from '@/lib/format'
import { useAction } from '@/lib/use-async'

const STEPS = [
  [
    'Contract renewals',
    'Creates renewal contracts and orders (awaiting approval) inside each renewal window; closes out ended terms.',
  ],
  ['Scheduled billing', 'Invoices every installment, completed milestone and recurring period due by the run date.'],
  ['Revenue recognition', 'Releases deferred revenue earned through the run date.'],
  ['Dunning', 'Queues the next reminder level for invoices coming due or past due.'],
] as const

export function BillingRun() {
  const [asOf, setAsOf] = useState(todayIso())
  const [results, setResults] = useState<{ asOf: string; steps: BillingRunStep[] } | null>(null)
  const action = useAction()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Billing Run" description="The daily order-to-cash sweep. Every step is safe to re-run." />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Steps">
            <ol className="space-y-3">
              {STEPS.map(([name, description], i) => {
                const result = results?.steps.find((s) => s.name === name)
                return (
                  <li key={name} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-ink">
                        {name}
                        {result &&
                          (result.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-success-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-danger-600" />
                          ))}
                      </div>
                      <div className="text-sm text-ink-muted">{description}</div>
                      {result && (
                        <div className={result.ok ? 'mt-1 text-sm text-ink' : 'mt-1 text-sm text-danger-700'}>
                          {result.summary}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Run">
            <div className="space-y-3">
              <Field label="Run as of" hint="Usually today. Use a past date to catch up.">
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </Field>
              <ErrorBanner message={action.error} />
              <Button
                className="w-full"
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    setResults({ asOf, steps: await runBillingEngine(asOf) })
                  })
                }
              >
                <PlayCircle className="h-4 w-4" />
                {action.pending ? 'Running…' : 'Run billing engine'}
              </Button>
              {results && <p className="text-xs text-ink-subtle">Last run as of {formatDate(results.asOf)}.</p>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

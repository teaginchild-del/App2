import { Landmark, Link2, Scale, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorBanner, NoticeBanner, Section, SimpleTable, Td } from '@/components/order-to-cash/layout'
import { StatementLineStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import {
  autoReconcile,
  createBankDeposit,
  ignoreStatementLine,
  importStatementCsv,
  listBankDeposits,
  listStatementLines,
  listUndepositedReceipts,
  matchStatementLine,
  proposeDeposits,
  type ReceiptView,
  type ReconcileSuggestion,
} from '@/lib/api/banking'
import { isoDate } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

const SOURCE_LABELS = { stripe_payout: 'Stripe payout', check_batch: 'Check batch', individual: 'Individual' } as const

export function Banking() {
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([listUndepositedReceipts(), listBankDeposits(), listStatementLines()]),
    [],
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<ReconcileSuggestion[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const action = useAction()

  const [receipts, deposits, lines] = data ?? [[], [], []]
  const proposals = proposeDeposits(receipts)
  const byId = new Map(receipts.map((r) => [r.id, r]))
  const unmatchedDeposits = deposits.filter((d) => !d.matched)
  const unmatchedLines = lines.filter((l) => l.status === 'unmatched')

  const run = async (fn: () => Promise<string | void>) => {
    let message: string | void = undefined
    const ok = await action.run(async () => {
      message = await fn()
    })
    if (ok) {
      setNotice(message ?? null)
      await reload()
    }
    return ok
  }

  const deposit = (items: ReceiptView[]) =>
    run(async () => {
      await createBankDeposit(items)
      setSelected(new Set())
      return `Bank deposit of ${formatCents(items.reduce((s, r) => s + r.amount, 0))} created.`
    })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    await run(async () => {
      const r = await importStatementCsv(await file.text())
      return `Imported ${r.imported} new line(s) of ${r.rows} in the file.`
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="Banking"
        description="Group receipts into bank deposits and reconcile them against the bank statement."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={action.pending}>
              <Upload className="h-4 w-4" />
              Import statement CSV
            </Button>
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  const r = await autoReconcile()
                  setSuggestions(r.suggestions)
                  return [
                    `${r.matched} statement line(s) matched.`,
                    r.suggestions.length
                      ? `${r.suggestions.length} line(s) have suggested receipt groupings below.`
                      : '',
                    ...r.failed,
                  ]
                    .filter(Boolean)
                    .join(' ')
                })
              }
              disabled={action.pending}
            >
              <Scale className="h-4 w-4" />
              Auto-reconcile
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard
          label="Undeposited Funds"
          value={formatCents(receipts.reduce((s, r) => s + r.amount, 0))}
          icon={Landmark}
        />
        <StatCard label="Unreconciled Deposits" value={unmatchedDeposits.length.toString()} icon={Link2} />
        <StatCard
          label="Unmatched Statement Lines"
          value={unmatchedLines.length.toString()}
          icon={Scale}
          tone={unmatchedLines.length ? 'danger' : 'default'}
        />
      </div>

      <div className="space-y-6 px-6 pb-6">
        <ErrorBanner message={error ?? action.error} />
        {notice && <NoticeBanner>{notice}</NoticeBanner>}
        {loading && !data && <div className="text-sm text-ink-muted">Loading...</div>}

        {proposals.length > 0 && (
          <Section title="Suggested bank deposits" flush>
            <SimpleTable head={['Date', 'Source', 'Receipts', 'Amount', '']}>
              {proposals.map((p) => (
                <tr key={p.key}>
                  <Td>{formatDate(isoDate(p.depositDate))}</Td>
                  <Td>{SOURCE_LABELS[p.source]}</Td>
                  <Td>{p.receiptIds.length}</Td>
                  <Td>{formatCents(p.amount)}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={action.pending}
                      onClick={() => deposit(p.receiptIds.map((id) => byId.get(id)!))}
                    >
                      Create deposit
                    </Button>
                  </Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>
        )}

        <Section
          title="Undeposited funds"
          flush
          actions={
            selected.size > 0 && (
              <Button
                size="sm"
                disabled={action.pending}
                onClick={() => deposit([...selected].map((id) => byId.get(id)!))}
              >
                Deposit {selected.size} selected
              </Button>
            )
          }
        >
          <SimpleTable
            head={['', 'Received', 'Customer', 'Type', 'Method', 'Reference', 'Amount']}
            empty={receipts.length === 0 && 'All receipts have been deposited.'}
          >
            {receipts.map((r) => (
              <tr key={r.id}>
                <Td>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s)
                        if (e.target.checked) next.add(r.id)
                        else next.delete(r.id)
                        return next
                      })
                    }
                  />
                </Td>
                <Td>{formatDate(isoDate(r.receivedOn))}</Td>
                <Td className="font-medium">{r.customerName}</Td>
                <Td className="capitalize">{r.kind}</Td>
                <Td>{r.method.toUpperCase()}</Td>
                <Td>{r.reference ?? r.stripePayoutId ?? '—'}</Td>
                <Td>{formatCents(r.amount)}</Td>
              </tr>
            ))}
          </SimpleTable>
        </Section>

        <Section title="Bank statement" flush>
          <SimpleTable
            head={['Posted', 'Description', 'Amount', 'Status', 'Match']}
            empty={
              lines.length === 0 && 'Import a statement CSV (Date, Description, Amount — or Credit/Debit columns).'
            }
          >
            {lines.map((l) => {
              const suggestion = suggestions.find((s) => s.statementLineId === l.id)
              const candidates = unmatchedDeposits.filter((d) => d.amountCents === l.amountCents)
              return (
                <tr key={l.id}>
                  <Td>{formatDate(l.postedOn)}</Td>
                  <Td>{l.description || '—'}</Td>
                  <Td className={l.amountCents < 0 ? 'text-danger-700' : ''}>{formatCents(l.amountCents)}</Td>
                  <Td>
                    <StatementLineStatusBadge status={l.status} />
                  </Td>
                  <Td>
                    {l.status === 'matched' && (
                      <span className="text-xs text-ink-subtle">
                        {deposits.find((d) => d.id === l.bankDepositId)
                          ? `Deposit ${formatDate(deposits.find((d) => d.id === l.bankDepositId)!.depositDate)}`
                          : 'Deposit'}{' '}
                        · {l.matchRule?.replace(/_/g, ' ')}
                      </span>
                    )}
                    {l.status === 'unmatched' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {candidates.length > 0 && (
                          <div className="w-48">
                            <Select
                              value=""
                              onChange={(e) =>
                                e.target.value &&
                                run(() => matchStatementLine(l.id, e.target.value).then(() => 'Matched.'))
                              }
                            >
                              <option value="">Match to deposit…</option>
                              {candidates.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {formatDate(d.depositDate)} · {SOURCE_LABELS[d.source]}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}
                        {suggestion && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              run(async () => {
                                const depositId = await createBankDeposit(
                                  suggestion.receiptIds.map((id) => byId.get(id)!).filter(Boolean),
                                  { depositDate: l.postedOn },
                                )
                                await matchStatementLine(l.id, depositId, 'manual')
                                setSuggestions((s) => s.filter((x) => x !== suggestion))
                                return `Deposited ${suggestion.receiptIds.length} receipt(s) and matched the line.`
                              })
                            }
                          >
                            Deposit {suggestion.receiptIds.length} suggested receipt(s)
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => run(() => ignoreStatementLine(l.id).then(() => 'Line ignored.'))}
                        >
                          Ignore
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              )
            })}
          </SimpleTable>
        </Section>

        <Section title="Bank deposits" flush>
          <SimpleTable
            head={['Date', 'Source', 'Reference', 'Amount', 'Reconciled']}
            empty={deposits.length === 0 && 'No bank deposits yet.'}
          >
            {deposits.map((d) => (
              <tr key={d.id}>
                <Td>{formatDate(d.depositDate)}</Td>
                <Td>{SOURCE_LABELS[d.source]}</Td>
                <Td>{d.reference ?? '—'}</Td>
                <Td>{formatCents(d.amountCents)}</Td>
                <Td>{d.matched ? 'Yes' : 'No'}</Td>
              </tr>
            ))}
          </SimpleTable>
        </Section>
      </div>
    </div>
  )
}

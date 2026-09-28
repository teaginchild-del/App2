import { BellOff, BellRing, Send, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordPaymentDialog } from '@/components/order-to-cash/CashDialogs'
import {
  BackTitle,
  ErrorBanner,
  Field,
  KeyValue,
  PageState,
  Section,
  SimpleTable,
  Td,
} from '@/components/order-to-cash/layout'
import { TermsSelect } from '@/components/order-to-cash/inputs'
import { InvoiceStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { getInvoice, getInvoiceActivity, issueDraftInvoice, setDunningPaused } from '@/lib/api/invoicing'
import { listO2cCustomers } from '@/lib/api/o2c-shared'
import { dateOnly, earlyPaymentDiscount, parseTerms, todayIso } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'
import type { InvoiceGlLine } from '@/types/billing'

const GL_LABELS: Record<InvoiceGlLine['account'], string> = {
  accounts_receivable: 'Accounts Receivable',
  revenue: 'Revenue',
  deferred_revenue: 'Deferred Revenue',
  sales_tax_payable: 'Sales Tax Payable',
  customer_deposits: 'Customer Deposits (liability)',
}

export function InvoiceDetail() {
  const { invoiceId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const invoice = await getInvoice(invoiceId)
    const [activity, customers] = await Promise.all([getInvoiceActivity(invoice), listO2cCustomers()])
    return { invoice, activity, customers }
  }, [invoiceId])
  const action = useAction()
  const [dialog, setDialog] = useState<'pay' | 'issue' | null>(null)

  if (!data) return <PageState loading={loading} error={error} backTo="/invoices" backLabel="Invoices" />
  const { invoice, activity, customers } = data
  const open = invoice.status === 'open' || invoice.status === 'partially_paid'
  const paid = activity.payments.reduce((sum, p) => sum + p.amountCents, 0)

  let discount = 0
  try {
    if (invoice.terms && open) {
      discount = earlyPaymentDiscount(
        dateOnly(invoice.issueDate),
        parseTerms(invoice.terms),
        invoice.balanceCents,
        dateOnly(todayIso()),
      )
    }
  } catch {
    discount = 0
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/invoices" label="Invoices">
            <span className="flex items-center gap-3">
              {invoice.invoiceNumber}
              <InvoiceStatusBadge status={invoice.status} />
            </span>
          </BackTitle>
        }
        description={`${invoice.customer?.companyName ?? ''} · issued ${formatDate(invoice.issueDate)}`}
        actions={
          <>
            {invoice.status === 'draft' && (
              <Button size="sm" onClick={() => setDialog('issue')}>
                <Send className="h-4 w-4" />
                Issue invoice
              </Button>
            )}
            {open && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (await action.run(() => setDunningPaused(invoice.id, !invoice.dunningPaused))) await reload()
                  }}
                >
                  {invoice.dunningPaused ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {invoice.dunningPaused ? 'Resume reminders' : 'Pause reminders'}
                </Button>
                <Button size="sm" onClick={() => setDialog('pay')}>
                  <Wallet className="h-4 w-4" />
                  Receive payment
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ErrorBanner message={action.error} />
          <Section title="Lines" flush>
            <SimpleTable head={['Description', 'Qty', 'Unit price', 'Tax', 'Amount']}>
              {invoice.lineItems.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div>{l.description}</div>
                    {l.deferred && (
                      <div className="text-xs text-ink-subtle">
                        Deferred · earned {l.revRecStart ? formatDate(l.revRecStart) : ''} –{' '}
                        {l.revRecEnd ? formatDate(l.revRecEnd) : ''}
                      </div>
                    )}
                  </Td>
                  <Td>{l.quantity}</Td>
                  <Td>{l.unitPriceCents != null ? formatCents(l.unitPriceCents) : '—'}</Td>
                  <Td>{l.taxCents ? formatCents(l.taxCents) : '—'}</Td>
                  <Td>{formatCents(l.amountCents)}</Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>

          {invoice.glLines.length > 0 && (
            <Section title="Journal entry" flush>
              <SimpleTable head={['Account', 'Debit', 'Credit']}>
                {invoice.glLines.map((g, i) => (
                  <tr key={i}>
                    <Td>{GL_LABELS[g.account]}</Td>
                    <Td>{g.debit ? formatCents(g.debit) : ''}</Td>
                    <Td>{g.credit ? formatCents(g.credit) : ''}</Td>
                  </tr>
                ))}
              </SimpleTable>
            </Section>
          )}

          <Section title="Payments & deposits applied" flush>
            <SimpleTable
              head={['Date', 'Type', 'Method', 'Reference', 'Amount']}
              empty={activity.payments.length + activity.deposits.length === 0 && 'Nothing applied yet.'}
            >
              {activity.deposits.map((d) => (
                <tr key={`d-${d.depositId}`}>
                  <Td>{formatDate(d.receivedOn)}</Td>
                  <Td>Deposit</Td>
                  <Td>{d.method.toUpperCase()}</Td>
                  <Td>—</Td>
                  <Td>{formatCents(d.amountCents)}</Td>
                </tr>
              ))}
              {activity.payments.map((p) => (
                <tr key={`p-${p.paymentId}`}>
                  <Td>{formatDate(p.receivedOn)}</Td>
                  <Td>Payment</Td>
                  <Td>{p.method.toUpperCase()}</Td>
                  <Td>{p.reference ?? '—'}</Td>
                  <Td>{formatCents(p.amountCents)}</Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>

          {activity.revRec.length > 0 && (
            <Section title="Revenue recognition schedule" flush>
              <SimpleTable head={['Line', 'Recognize on', 'Amount', 'Status']}>
                {activity.revRec.map((r) => (
                  <tr key={r.id}>
                    <Td className="text-ink-muted">{r.description}</Td>
                    <Td>{formatDate(r.recognizeOn)}</Td>
                    <Td>{formatCents(r.amountCents)}</Td>
                    <Td>{r.recognizedAt ? 'Recognized' : 'Deferred'}</Td>
                  </tr>
                ))}
              </SimpleTable>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Summary">
            <KeyValue label="Customer" value={invoice.customer?.companyName ?? '—'} />
            <KeyValue label="Terms" value={invoice.terms ?? '—'} />
            <KeyValue label="Due date" value={invoice.dueDate ? formatDate(invoice.dueDate) : '—'} />
            {invoice.salesOrderId && (
              <KeyValue
                label="Sales order"
                value={
                  <Link className="text-brand-600 hover:underline" to={`/sales-orders/${invoice.salesOrderId}`}>
                    {invoice.memo ?? 'View order'}
                  </Link>
                }
              />
            )}
            {invoice.subscriptionId && (
              <KeyValue
                label="Subscription"
                value={
                  <Link className="text-brand-600 hover:underline" to={`/subscriptions/${invoice.subscriptionId}`}>
                    View subscription
                  </Link>
                }
              />
            )}
            <div className="my-2 border-t border-slate-100" />
            <KeyValue label="Subtotal" value={formatCents(invoice.subtotalCents)} />
            <KeyValue label="Tax" value={formatCents(invoice.taxTotalCents)} />
            <KeyValue label="Total" value={formatCents(invoice.totalCents)} tone="strong" />
            {invoice.depositAppliedCents > 0 && (
              <KeyValue
                label="Deposits applied"
                value={`− ${formatCents(invoice.depositAppliedCents)}`}
                tone="success"
              />
            )}
            {paid > 0 && <KeyValue label="Payments" value={`− ${formatCents(paid)}`} tone="success" />}
            <KeyValue
              label="Balance due"
              value={formatCents(invoice.balanceCents)}
              tone={invoice.balanceCents > 0 ? 'danger' : 'success'}
            />
            {discount > 0 && (
              <p className="mt-2 text-xs text-success-700">
                Early-payment discount of {formatCents(discount)} available if paid today.
              </p>
            )}
          </Section>

          {(activity.dunning.length > 0 || invoice.dunningPaused) && (
            <Section title="Reminders">
              {invoice.dunningPaused && (
                <p className="mb-2 text-sm text-warning-700">Reminders are paused for this invoice.</p>
              )}
              {activity.dunning.map((n) => (
                <KeyValue key={n.level} label={`Level ${n.level}: ${n.subject}`} value={n.deliveryStatus} />
              ))}
            </Section>
          )}
        </div>
      </div>

      {dialog === 'pay' && (
        <RecordPaymentDialog
          open
          onClose={() => setDialog(null)}
          onRecorded={reload}
          customers={customers}
          customerId={invoice.customerId}
        />
      )}
      <IssueDialog
        open={dialog === 'issue'}
        onClose={() => setDialog(null)}
        defaultTerms={invoice.customer?.paymentTerms ?? 'Net 30'}
        onIssue={async (terms) => {
          if (await action.run(() => issueDraftInvoice(invoice, terms))) {
            setDialog(null)
            await reload()
          }
        }}
        pending={action.pending}
      />
    </div>
  )
}

function IssueDialog({
  open,
  onClose,
  defaultTerms,
  onIssue,
  pending,
}: {
  open: boolean
  onClose: () => void
  defaultTerms: string
  onIssue: (terms: string) => void
  pending: boolean
}) {
  const [terms, setTerms] = useState(defaultTerms)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Issue invoice"
      subtitle="The due date is calculated from the payment terms"
    >
      <div className="space-y-4">
        <Field label="Payment terms">
          <TermsSelect value={terms} onChange={setTerms} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onIssue(terms)} disabled={pending}>
            Issue
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

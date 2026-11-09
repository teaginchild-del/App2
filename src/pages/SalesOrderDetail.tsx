import { CheckCircle2, FileText, PackageCheck, PiggyBank, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordDepositDialog } from '@/components/order-to-cash/CashDialogs'
import {
  BackTitle,
  ErrorBanner,
  Field,
  KeyValue,
  NoticeBanner,
  PageState,
  Section,
  SimpleTable,
  Td,
} from '@/components/order-to-cash/layout'
import { RelatedRecordsCard } from '@/components/order-to-cash/RelatedRecordsCard'
import {
  BillingEventStatusBadge,
  DepositStatusBadge,
  InvoiceStatusBadge,
  SalesOrderStatusBadge,
} from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { listDeposits } from '@/lib/api/cash'
import { billSalesOrder, listInvoices, previewBillableCents } from '@/lib/api/invoicing'
import { listO2cCustomers } from '@/lib/api/o2c-shared'
import {
  approveSalesOrder,
  cancelSalesOrder,
  closeSalesOrder,
  completeMilestone,
  getSalesOrder,
  listFulfillments,
  recordFulfillment,
} from '@/lib/api/sales-orders'
import { todayIso, type BillingScheduleSpec } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'
import type { BillingEvent, SalesOrder } from '@/types/order-to-cash'

function scheduleLabel(spec: BillingScheduleSpec | null, itemKind: string): string {
  if (!spec) return itemKind === 'inventory' ? 'As fulfilled' : 'On approval'
  switch (spec.type) {
    case 'one_time':
      return spec.billDate ? `One-time ${formatDate(spec.billDate)}` : 'One-time'
    case 'installments':
      return `${spec.count} installments`
    case 'milestones':
      return `${spec.milestones.length} milestones`
    case 'recurring':
      return `${{ 1: 'Monthly', 3: 'Quarterly', 6: 'Semi-annual', 12: 'Annual' }[spec.frequencyMonths]} in ${spec.timing}`
  }
}

export function SalesOrderDetail() {
  const { salesOrderId = '' } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        getSalesOrder(salesOrderId),
        listFulfillments(salesOrderId),
        listDeposits({ salesOrderId }),
        listInvoices({ salesOrderId }),
        listO2cCustomers(),
      ]),
    [salesOrderId],
  )
  const action = useAction()
  const [dialog, setDialog] = useState<'bill' | 'fulfill' | 'deposit' | null>(null)
  const [milestone, setMilestone] = useState<BillingEvent | null>(null)

  if (!data) return <PageState loading={loading} error={error} backTo="/sales-orders" backLabel="Sales Orders" />
  const [order, fulfillments, deposits, invoices, customers] = data

  const open = !['cancelled', 'closed', 'pending_approval'].includes(order.status)
  const hasInventory = order.lines.some((l) => l.itemKind === 'inventory' && l.quantityFulfilled < l.quantity)
  const nothingBilled = order.lines.every((l) => l.amountBilledCents === 0)
  const total = order.lines.reduce((sum, l) => sum + l.amountCents, 0)
  const billed = order.lines.reduce((sum, l) => sum + l.amountBilledCents, 0)
  const depositsReceived = deposits.reduce((sum, d) => sum + d.amountCents - d.amountRefundedCents, 0)
  const scheduledLines = order.lines.filter((l) => l.billingEvents.length > 0)

  const act = (fn: () => Promise<unknown>, confirmText?: string) => async () => {
    if (confirmText && !window.confirm(confirmText)) return
    if (await action.run(fn)) await reload()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/sales-orders" label="Sales Orders">
            <span className="flex items-center gap-3">
              {order.orderNumber}
              <SalesOrderStatusBadge status={order.status} />
            </span>
          </BackTitle>
        }
        description={`${order.customer.companyName} · ordered ${formatDate(order.orderDate)}`}
        actions={
          <>
            {order.status === 'pending_approval' && (
              <Button size="sm" onClick={act(() => approveSalesOrder(order.id))} disabled={action.pending}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
            )}
            {open && hasInventory && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('fulfill')}>
                <PackageCheck className="h-4 w-4" />
                Fulfill
              </Button>
            )}
            {!order.cancelledAt && !order.closedAt && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('deposit')}>
                <PiggyBank className="h-4 w-4" />
                Record deposit
              </Button>
            )}
            {open && order.status !== 'billed' && (
              <Button size="sm" onClick={() => setDialog('bill')}>
                <FileText className="h-4 w-4" />
                Bill now
              </Button>
            )}
            {!order.cancelledAt &&
              !order.closedAt &&
              (nothingBilled ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={act(
                    () => cancelSalesOrder(order.id),
                    'Cancel this order? Pending billing will be cancelled.',
                  )}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={act(
                    () => closeSalesOrder(order.id),
                    'Close this order? No further lines or schedule events will be billed.',
                  )}
                >
                  <XCircle className="h-4 w-4" />
                  Close
                </Button>
              ))}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ErrorBanner message={action.error} />

          <Section title="Lines" flush>
            <SimpleTable head={['Item', 'Billing', 'Qty', 'Fulfilled', 'Amount', 'Billed']}>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div className="font-medium">{l.description}</div>
                    <div className="text-xs text-ink-subtle">
                      {l.itemKind.replace('_', '-')}
                      {l.taxable ? ` · tax ${l.taxRatePercent}%` : ''}
                      {l.revenueTreatment === 'ratable' ? ' · ratable revenue' : ''}
                    </div>
                  </Td>
                  <Td className="text-ink-muted">{scheduleLabel(l.billingSchedule, l.itemKind)}</Td>
                  <Td>{l.quantity}</Td>
                  <Td>{l.itemKind === 'inventory' ? l.quantityFulfilled : '—'}</Td>
                  <Td>{formatCents(l.amountCents)}</Td>
                  <Td>{formatCents(l.amountBilledCents)}</Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>

          {scheduledLines.length > 0 && (
            <Section title="Billing schedule" flush>
              <SimpleTable head={['Line', 'Event', 'Bill date', 'Amount', 'Status', '']}>
                {scheduledLines.flatMap((l) =>
                  l.billingEvents.map((e) => (
                    <tr key={e.id}>
                      <Td className="text-ink-muted">{l.description}</Td>
                      <Td>
                        {e.milestoneName ??
                          (e.periodStart && e.periodEnd
                            ? `${formatDate(e.periodStart)} – ${formatDate(e.periodEnd)}`
                            : `#${e.seq}`)}
                      </Td>
                      <Td>
                        {e.billDate ? formatDate(e.billDate) : <span className="text-ink-subtle">On completion</span>}
                      </Td>
                      <Td>{formatCents(e.amountCents)}</Td>
                      <Td>
                        <BillingEventStatusBadge status={e.status} />
                      </Td>
                      <Td className="text-right">
                        {e.milestoneName && e.status === 'pending' && !e.billDate && open && (
                          <Button size="sm" variant="secondary" onClick={() => setMilestone(e)}>
                            Mark complete
                          </Button>
                        )}
                      </Td>
                    </tr>
                  )),
                )}
              </SimpleTable>
            </Section>
          )}

          <Section title="Invoices" flush>
            <SimpleTable
              head={['Invoice', 'Date', 'Due', 'Total', 'Balance', 'Status']}
              empty={invoices.length === 0 && 'Nothing billed yet.'}
            >
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="cursor-pointer hover:bg-brand-50/40"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <Td className="font-medium text-brand-600">{inv.invoiceNumber}</Td>
                  <Td>{formatDate(inv.issueDate)}</Td>
                  <Td>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</Td>
                  <Td>{formatCents(inv.totalCents)}</Td>
                  <Td>{formatCents(inv.balanceCents)}</Td>
                  <Td>
                    <InvoiceStatusBadge status={inv.status} />
                  </Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>

          {fulfillments.length > 0 && (
            <Section title="Fulfillments" flush>
              <SimpleTable head={['Date', 'Reference', 'Items']}>
                {fulfillments.map((f) => (
                  <tr key={f.id}>
                    <Td>{formatDate(f.fulfilledOn)}</Td>
                    <Td>{f.reference ?? '—'}</Td>
                    <Td>
                      {f.lines
                        .map(
                          (fl) =>
                            `${fl.quantity} × ${order.lines.find((l) => l.id === fl.salesOrderLineId)?.description ?? ''}`,
                        )
                        .join(', ')}
                    </Td>
                  </tr>
                ))}
              </SimpleTable>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Summary">
            <KeyValue label="Customer" value={order.customer.companyName} />
            <KeyValue label="Terms" value={order.terms} />
            {order.memo && <KeyValue label="Memo" value={order.memo} />}
            {order.contractId && (
              <KeyValue
                label="Contract"
                value={
                  <Link className="text-brand-600 hover:underline" to={`/contracts/${order.contractId}`}>
                    View contract
                  </Link>
                }
              />
            )}
            {order.approvedAt && (
              <KeyValue
                label="Approved"
                value={`${formatDate(order.approvedAt.slice(0, 10))} by ${order.approvedBy ?? '—'}`}
              />
            )}
            <div className="my-2 border-t border-slate-100" />
            <KeyValue label="Order total (pre-tax)" value={formatCents(total)} tone="strong" />
            <KeyValue label="Billed" value={formatCents(billed)} />
            <KeyValue label="Unbilled" value={formatCents(total - billed)} />
          </Section>

          <Section title="Deposits">
            {order.depositRequestedCents ? (
              <>
                <KeyValue label="Requested" value={formatCents(order.depositRequestedCents)} />
                <KeyValue
                  label="Received"
                  value={formatCents(depositsReceived)}
                  tone={depositsReceived >= order.depositRequestedCents ? 'success' : 'danger'}
                />
              </>
            ) : (
              <p className="text-sm text-ink-subtle">No deposit requested.</p>
            )}
            {deposits.map((d) => (
              <div key={d.id} className="mt-2 flex items-center justify-between gap-2 text-sm">
                <Link className="text-brand-600 hover:underline" to={`/payments/deposits/${d.id}`}>
                  {formatDate(d.receivedOn)} · {d.method.toUpperCase()}
                </Link>
                <span className="flex items-center gap-2">
                  {formatCents(d.amountCents)}
                  <DepositStatusBadge status={d.status} />
                </span>
              </div>
            ))}
            {deposits.length > 0 && (
              <p className="mt-3 text-xs text-ink-subtle">
                Deposits on this order are applied automatically to its invoices.
              </p>
            )}
          </Section>
          <RelatedRecordsCard type="sales_order" id={order.id} refreshKey={data} />
        </div>
      </div>

      <BillDialog
        order={order}
        open={dialog === 'bill'}
        onClose={() => setDialog(null)}
        onBilled={(id) => navigate(`/invoices/${id}`)}
      />
      <FulfillDialog order={order} open={dialog === 'fulfill'} onClose={() => setDialog(null)} onDone={reload} />
      {dialog === 'deposit' && (
        <RecordDepositDialog
          open
          onClose={() => setDialog(null)}
          onRecorded={reload}
          customers={customers}
          salesOrder={order}
        />
      )}
      <MilestoneDialog event={milestone} onClose={() => setMilestone(null)} onDone={reload} />
    </div>
  )
}

function BillDialog({
  order,
  open,
  onClose,
  onBilled,
}: {
  order: SalesOrder
  open: boolean
  onClose: () => void
  onBilled: (invoiceId: string) => void
}) {
  const [asOf, setAsOf] = useState(todayIso())
  const [applyUnlinked, setApplyUnlinked] = useState(false)
  const action = useAction()
  let preview = 0
  try {
    preview = previewBillableCents(order, asOf)
  } catch {
    preview = 0
  }

  const submit = async () => {
    let id = ''
    const ok = await action.run(async () => {
      id = await billSalesOrder(order.id, { asOf, applyUnlinkedDeposits: applyUnlinked })
    })
    if (ok) onBilled(id)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Bill ${order.orderNumber}`}
      subtitle="Invoice everything billable as of a date"
    >
      <div className="space-y-4">
        <Field label="Bill through" hint="Fulfilled goods, unbilled services, and schedule events due by this date">
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
        <CheckboxField
          label="Also apply customer-level deposits"
          description="Deposits taken on this order are always applied first."
          checked={applyUnlinked}
          onChange={(e) => setApplyUnlinked(e.target.checked)}
        />
        {preview > 0 ? (
          <NoticeBanner>
            {formatCents(preview)} (before tax and deposits) is billable as of {formatDate(asOf)}.
          </NoticeBanner>
        ) : (
          <NoticeBanner>Nothing is billable as of {formatDate(asOf)}.</NoticeBanner>
        )}
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={action.pending || preview === 0}>
            {action.pending ? 'Billing…' : 'Create invoice'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function FulfillDialog({
  order,
  open,
  onClose,
  onDone,
}: {
  order: SalesOrder
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [fulfilledOn, setFulfilledOn] = useState(todayIso())
  const [reference, setReference] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const action = useAction()
  const lines = order.lines.filter((l) => l.itemKind === 'inventory' && l.quantityFulfilled < l.quantity)

  const submit = async () => {
    const ok = await action.run(() =>
      recordFulfillment(order, {
        fulfilledOn,
        reference,
        lines: lines.map((l) => ({ lineId: l.id, quantity: Number(quantities[l.id] || 0) })),
      }),
    )
    if (ok) {
      setQuantities({})
      setReference('')
      onDone()
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Record fulfillment" subtitle="Shipped quantities become billable">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shipped on">
            <Input type="date" value={fulfilledOn} onChange={(e) => setFulfilledOn(e.target.value)} />
          </Field>
          <Field label="Tracking / reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        {lines.map((l) => (
          <div key={l.id} className="flex items-center gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-ink">{l.description}</div>
              <div className="text-xs text-ink-subtle">
                {l.quantityFulfilled} of {l.quantity} shipped
              </div>
            </div>
            <div className="w-28">
              <Input
                inputMode="decimal"
                placeholder={String(l.quantity - l.quantityFulfilled)}
                value={quantities[l.id] ?? ''}
                onChange={(e) => setQuantities((q) => ({ ...q, [l.id]: e.target.value }))}
              />
            </div>
          </div>
        ))}
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={action.pending}>
            {action.pending ? 'Saving…' : 'Record shipment'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function MilestoneDialog({
  event,
  onClose,
  onDone,
}: {
  event: BillingEvent | null
  onClose: () => void
  onDone: () => void
}) {
  const [completedOn, setCompletedOn] = useState(todayIso())
  const action = useAction()
  const submit = async () => {
    if (!event) return
    if (await action.run(() => completeMilestone(event, completedOn))) {
      onDone()
      onClose()
    }
  }
  return (
    <Dialog
      open={event != null}
      onClose={onClose}
      title={`Complete “${event?.milestoneName ?? ''}”`}
      subtitle="The milestone becomes billable on this date"
    >
      <div className="space-y-4">
        <Field label="Completed on">
          <Input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
        </Field>
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={action.pending}>
            Mark complete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

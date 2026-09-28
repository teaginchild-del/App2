import { useEffect, useMemo, useState } from 'react'
import { ErrorBanner, Field, NoticeBanner } from '@/components/order-to-cash/layout'
import { CustomerSelect, MethodSelect, MoneyInput } from '@/components/order-to-cash/inputs'
import { parseMoney } from '@/components/order-to-cash/line-drafts'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { applyPayment, dateOnly, todayIso, type ReceiptMethod } from '@/lib/billing-engine'
import {
  listOpenInvoices,
  receiveCustomerPayment,
  recordCustomerDeposit,
  type OpenInvoiceSummary,
} from '@/lib/api/cash'
import { newIdempotencyKey } from '@/lib/api/o2c-shared'
import { formatCents, formatDate } from '@/lib/format'
import { useAction } from '@/lib/use-async'
import type { O2cCustomer, SalesOrder } from '@/types/order-to-cash'

/**
 * Receive a customer payment (check, ACH, wire, ...) against open invoices.
 * Auto-applies oldest-due-first unless the user enters an explicit split;
 * any excess stays on the account as unapplied credit. Mount it only while
 * open so each opening starts with a clean form.
 */
export function RecordPaymentDialog({
  open,
  onClose,
  onRecorded,
  customers,
  customerId: fixedCustomerId,
}: {
  open: boolean
  onClose: () => void
  onRecorded: () => void
  customers: O2cCustomer[]
  customerId?: string
}) {
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<ReceiptMethod>('check')
  const [receivedOn, setReceivedOn] = useState(todayIso())
  const [reference, setReference] = useState('')
  const [explicit, setExplicit] = useState(false)
  const [split, setSplit] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState<{ customerId: string; invoices: OpenInvoiceSummary[] } | null>(null)
  // One key per dialog opening, so a double-click or retry records the payment once.
  const [idempotencyKey] = useState(() => newIdempotencyKey('payment'))
  const action = useAction()

  useEffect(() => {
    if (!customerId) return
    let active = true
    listOpenInvoices(customerId).then(
      (invoices) => active && setLoaded({ customerId, invoices }),
      () => active && setLoaded({ customerId, invoices: [] }),
    )
    return () => {
      active = false
    }
  }, [customerId])
  const openInvoices = useMemo(
    () => (loaded && loaded.customerId === customerId ? loaded.invoices : []),
    [loaded, customerId],
  )

  const amountCents = parseMoney(amount)
  const preview = useMemo(() => {
    if (!(amountCents > 0)) return null
    try {
      return applyPayment(
        amountCents,
        openInvoices.map((i) => ({
          id: i.id,
          balance: i.balanceCents,
          dueDate: i.dueDate ? dateOnly(i.dueDate) : null,
          invoiceDate: dateOnly(i.issueDate),
        })),
        explicit
          ? Object.entries(split)
              .map(([invoiceId, v]) => ({ invoiceId, amount: parseMoney(v) }))
              .filter((a) => a.amount > 0)
          : undefined,
      )
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [amountCents, openInvoices, explicit, split])

  const submit = async () => {
    const ok = await action.run(() =>
      receiveCustomerPayment({
        idempotencyKey,
        customerId,
        amountCents,
        method,
        receivedOn,
        reference,
        applications: explicit
          ? Object.entries(split)
              .map(([invoiceId, v]) => ({ invoiceId, amountCents: parseMoney(v) }))
              .filter((a) => a.amountCents > 0)
          : undefined,
      }),
    )
    if (ok) {
      onRecorded()
      onClose()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Receive payment"
      subtitle="Record a check, ACH, wire or card payment"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              disabled={!!fixedCustomerId}
            />
          </Field>
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Method">
            <MethodSelect value={method} onChange={setMethod} />
          </Field>
          <Field label="Received on">
            <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </Field>
          <Field label="Reference" hint="Check number, ACH trace, etc." className="sm:col-span-2">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        {customerId && (
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Open invoices</span>
              <CheckboxField
                label="Split manually"
                checked={explicit}
                onChange={(e) => setExplicit(e.target.checked)}
                className="py-0"
              />
            </div>
            {openInvoices.length === 0 ? (
              <div className="px-3 py-4 text-sm text-ink-subtle">
                No open invoices — the payment will be held as unapplied credit.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {openInvoices.map((inv) => {
                  const applied =
                    preview && 'applications' in preview
                      ? (preview.applications.find((a) => a.invoiceId === inv.id)?.amount ?? 0)
                      : 0
                  return (
                    <div key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink">{inv.invoiceNumber}</div>
                        <div className="text-xs text-ink-subtle">Due {inv.dueDate ? formatDate(inv.dueDate) : '—'}</div>
                      </div>
                      <div className="w-28 text-right text-ink-muted">{formatCents(inv.balanceCents)}</div>
                      {explicit ? (
                        <div className="w-32">
                          <MoneyInput
                            value={split[inv.id] ?? ''}
                            onChange={(v) => setSplit((s) => ({ ...s, [inv.id]: v }))}
                          />
                        </div>
                      ) : (
                        <div className="w-32 text-right font-medium text-ink">
                          {applied ? formatCents(applied) : '—'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {preview && 'error' in preview && <ErrorBanner message={preview.error ?? null} />}
        {preview && 'unapplied' in preview && preview.unapplied > 0 && (
          <NoticeBanner>{formatCents(preview.unapplied)} will stay on the account as unapplied credit.</NoticeBanner>
        )}
        <ErrorBanner message={action.error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={action.pending || !customerId || !(amountCents > 0) || (preview != null && 'error' in preview)}
          >
            {action.pending ? 'Recording…' : 'Record payment'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Record a customer deposit — a prepayment taken before the invoice exists.
 * Deposits on a sales order are applied automatically when it is billed.
 * Mount it only while open.
 */
export function RecordDepositDialog({
  open,
  onClose,
  onRecorded,
  customers,
  salesOrders = [],
  salesOrder,
}: {
  open: boolean
  onClose: () => void
  onRecorded: () => void
  customers: O2cCustomer[]
  salesOrders?: SalesOrder[]
  salesOrder?: SalesOrder
}) {
  const [customerId, setCustomerId] = useState(salesOrder?.customerId ?? '')
  const [salesOrderId, setSalesOrderId] = useState(salesOrder?.id ?? '')
  const [amount, setAmount] = useState(
    salesOrder?.depositRequestedCents ? (salesOrder.depositRequestedCents / 100).toFixed(2) : '',
  )
  const [method, setMethod] = useState<ReceiptMethod>('check')
  const [receivedOn, setReceivedOn] = useState(todayIso())
  const [reference, setReference] = useState('')
  const [payoutId, setPayoutId] = useState('')
  const action = useAction()

  const openOrders = salesOrders.filter(
    (so) => so.customerId === customerId && so.status !== 'cancelled' && so.status !== 'closed',
  )
  const amountCents = parseMoney(amount)

  const submit = async () => {
    const ok = await action.run(() =>
      recordCustomerDeposit({
        customerId,
        salesOrderId: salesOrderId || null,
        amountCents,
        method,
        receivedOn,
        reference,
        stripePayoutId: payoutId,
      }),
    )
    if (ok) {
      onRecorded()
      onClose()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record customer deposit"
      subtitle="Prepayment held until it is applied to an invoice"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <CustomerSelect customers={customers} value={customerId} onChange={setCustomerId} disabled={!!salesOrder} />
          </Field>
          <Field label="Sales order" hint="Blank = customer-level deposit">
            <Select value={salesOrderId} onChange={(e) => setSalesOrderId(e.target.value)} disabled={!!salesOrder}>
              <option value="">None</option>
              {(salesOrder ? [salesOrder] : openOrders).map((so) => (
                <option key={so.id} value={so.id}>
                  {so.orderNumber}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Method">
            <MethodSelect value={method} onChange={setMethod} />
          </Field>
          <Field label="Received on">
            <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          {(method === 'stripe' || method === 'card') && (
            <Field
              label="Stripe payout ID"
              hint="Groups the receipt into its payout's bank deposit"
              className="sm:col-span-2"
            >
              <Input value={payoutId} onChange={(e) => setPayoutId(e.target.value)} placeholder="po_..." />
            </Field>
          )}
        </div>
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={action.pending || !customerId || !(amountCents > 0)}>
            {action.pending ? 'Recording…' : 'Record deposit'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

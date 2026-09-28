import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BackTitle, ErrorBanner, Field, KeyValue, Section } from '@/components/order-to-cash/layout'
import { CustomerSelect, TermsSelect } from '@/components/order-to-cash/inputs'
import { LineItemsEditor } from '@/components/order-to-cash/LineItemsEditor'
import { emptyLine, lineNumbers, type LineDraft } from '@/components/order-to-cash/line-drafts'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { listProducts } from '@/lib/api/billing'
import { createStandaloneInvoice, type StandaloneInvoiceLine } from '@/lib/api/invoicing'
import { listO2cCustomers, newIdempotencyKey } from '@/lib/api/o2c-shared'
import { buildInvoiceDraft, dateOnly, isoDate, parseTerms, todayIso } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

export function InvoiceNew() {
  const navigate = useNavigate()
  const { data } = useAsync(() => Promise.all([listO2cCustomers(), listProducts()]), [])
  const [customers, products] = data ?? [[], []]

  const [customerId, setCustomerId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayIso())
  const [terms, setTerms] = useState('Net 30')
  const [memo, setMemo] = useState('')
  const [applyDeposits, setApplyDeposits] = useState(true)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [idempotencyKey] = useState(() => newIdempotencyKey('invoice'))
  const action = useAction()

  const built = useMemo(() => {
    try {
      const inputs: StandaloneInvoiceLine[] = lines.map((line, i) => ({
        productId: line.productId || null,
        description: line.description,
        ...lineNumbers(line, i),
        taxable: line.taxable,
        revenueTreatment: line.revenueTreatment,
        revRecStart: line.revRecStart || null,
        revRecEnd: line.revRecEnd || null,
      }))
      const draft = buildInvoiceDraft({
        invoiceDate: dateOnly(invoiceDate),
        terms: parseTerms(terms),
        lines: inputs.map((l) => ({
          description: l.description || 'Line',
          amount: Math.round(l.quantity * l.unitPriceCents),
          taxable: l.taxable,
          taxRatePercent: l.taxRatePercent,
          revenueTreatment: l.revenueTreatment,
          revRecStart: l.revRecStart ? dateOnly(l.revRecStart) : undefined,
          revRecEnd: l.revRecEnd ? dateOnly(l.revRecEnd) : undefined,
        })),
      })
      return { inputs, draft, error: null }
    } catch (err) {
      return { inputs: null, draft: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [lines, invoiceDate, terms])

  const submit = async () => {
    let id = ''
    const ok = await action.run(async () => {
      if (!customerId) throw new Error('Pick a customer')
      if (!built.inputs) throw new Error(built.error ?? 'Check the invoice lines')
      id = await createStandaloneInvoice({
        idempotencyKey,
        customerId,
        invoiceDate,
        terms,
        memo,
        applyUnlinkedDeposits: applyDeposits,
        lines: built.inputs,
      })
    })
    if (ok) navigate(`/invoices/${id}`)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/invoices" label="Invoices">
            New Invoice
          </BackTitle>
        }
        description="A one-off invoice with no sales order behind it."
      />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Invoice">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Customer">
                <CustomerSelect
                  customers={customers}
                  value={customerId}
                  onChange={(id) => {
                    setCustomerId(id)
                    const c = customers.find((x) => x.id === id)
                    if (c) setTerms(c.paymentTerms)
                  }}
                />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>
              <Field label="Payment terms">
                <TermsSelect value={terms} onChange={setTerms} />
              </Field>
              <Field label="Memo">
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
              </Field>
            </div>
          </Section>
          <Section title="Lines">
            <LineItemsEditor lines={lines} onChange={setLines} products={products} mode="invoice" />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Summary">
            <KeyValue label="Subtotal" value={formatCents(built.draft?.subtotal ?? 0)} />
            <KeyValue label="Tax" value={formatCents(built.draft?.taxTotal ?? 0)} />
            <KeyValue label="Total" value={formatCents(built.draft?.total ?? 0)} tone="strong" />
            {built.draft && <KeyValue label="Due" value={formatDate(isoDate(built.draft.dueDate))} />}
            <div className="mt-3">
              <CheckboxField
                label="Apply customer deposits"
                description="Unused customer-level deposits reduce the balance due."
                checked={applyDeposits}
                onChange={(e) => setApplyDeposits(e.target.checked)}
              />
            </div>
            <div className="mt-4 space-y-3">
              <ErrorBanner message={action.error ?? (lines.some((l) => l.unitPrice) ? built.error : null)} />
              <Button className="w-full" onClick={submit} disabled={action.pending}>
                {action.pending ? 'Creating…' : 'Create invoice'}
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

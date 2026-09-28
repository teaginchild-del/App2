import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BackTitle, ErrorBanner, Field, KeyValue, Section } from '@/components/order-to-cash/layout'
import { CustomerSelect, MoneyInput, TermsSelect } from '@/components/order-to-cash/inputs'
import { LineItemsEditor } from '@/components/order-to-cash/LineItemsEditor'
import {
  emptyLine,
  lineNumbers,
  lineSchedule,
  parseMoney,
  type LineDraft,
} from '@/components/order-to-cash/line-drafts'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { listProducts } from '@/lib/api/billing'
import { listO2cCustomers } from '@/lib/api/o2c-shared'
import { createSalesOrder, salesOrderLineAmount, type SalesOrderLineInput } from '@/lib/api/sales-orders'
import { percentOf, todayIso } from '@/lib/billing-engine'
import { formatCents } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

export function SalesOrderNew() {
  const navigate = useNavigate()
  const { data } = useAsync(() => Promise.all([listO2cCustomers(), listProducts()]), [])
  const [customers, products] = data ?? [[], []]

  const [customerId, setCustomerId] = useState('')
  const [orderDate, setOrderDate] = useState(todayIso())
  const [terms, setTerms] = useState('Net 30')
  const [memo, setMemo] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(true)
  const [depositPercent, setDepositPercent] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const action = useAction()

  const chooseCustomer = (id: string) => {
    setCustomerId(id)
    const customer = customers.find((c) => c.id === id)
    if (customer) setTerms(customer.paymentTerms)
  }

  const built = useMemo(() => {
    try {
      const inputs: SalesOrderLineInput[] = lines.map((line, i) => {
        const { quantity, unitPriceCents, taxRatePercent } = lineNumbers(line, i)
        return {
          productId: line.productId || null,
          description: line.description,
          itemKind: line.itemKind,
          quantity,
          unitPriceCents,
          taxable: line.taxable,
          taxRatePercent,
          revenueTreatment: line.revenueTreatment,
          revRecStart: line.revRecStart || null,
          revRecEnd: line.revRecEnd || null,
          billingSchedule: lineSchedule(line),
        }
      })
      const subtotal = inputs.reduce((sum, l) => sum + salesOrderLineAmount(l), 0)
      const tax = inputs.reduce(
        (sum, l) => sum + (l.taxable ? percentOf(salesOrderLineAmount(l), l.taxRatePercent) : 0),
        0,
      )
      return { inputs, subtotal, tax, error: null }
    } catch (err) {
      return { inputs: null, subtotal: 0, tax: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }, [lines])

  const depositCents = depositAmount
    ? parseMoney(depositAmount)
    : depositPercent
      ? percentOf(built.subtotal + built.tax, Number(depositPercent))
      : null

  const submit = async () => {
    let id = ''
    const ok = await action.run(async () => {
      if (!customerId) throw new Error('Pick a customer')
      if (!built.inputs) throw new Error(built.error ?? 'Check the order lines')
      id = await createSalesOrder({
        customerId,
        orderDate,
        terms,
        memo,
        requiresApproval,
        depositRequestedCents:
          depositCents != null && Number.isFinite(depositCents) && depositCents > 0 ? depositCents : null,
        lines: built.inputs,
      })
    })
    if (ok) navigate(`/sales-orders/${id}`)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/sales-orders" label="Sales Orders">
            New Sales Order
          </BackTitle>
        }
        description="Lines bill as they ship, when approved, or on a billing schedule."
      />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Order">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Customer">
                <CustomerSelect customers={customers} value={customerId} onChange={chooseCustomer} />
              </Field>
              <Field label="Order date">
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </Field>
              <Field label="Payment terms" hint="Invoice due dates are calculated from these">
                <TermsSelect value={terms} onChange={setTerms} />
              </Field>
              <Field label="Memo">
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="PO number, notes…" />
              </Field>
            </div>
          </Section>

          <Section title="Lines">
            <LineItemsEditor lines={lines} onChange={setLines} products={products} mode="sales_order" />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Deposit & approval">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Deposit %">
                  <Input
                    inputMode="decimal"
                    value={depositPercent}
                    onChange={(e) => {
                      setDepositPercent(e.target.value)
                      setDepositAmount('')
                    }}
                    placeholder="e.g. 50"
                  />
                </Field>
                <Field label="or amount">
                  <MoneyInput
                    value={depositAmount}
                    onChange={(v) => {
                      setDepositAmount(v)
                      setDepositPercent('')
                    }}
                  />
                </Field>
              </div>
              <CheckboxField
                label="Requires approval"
                description="Unapproved orders can't be fulfilled or billed."
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
              />
            </div>
          </Section>

          <Section title="Summary">
            <KeyValue label="Subtotal" value={formatCents(built.subtotal)} />
            <KeyValue label="Estimated tax" value={formatCents(built.tax)} />
            <KeyValue label="Order total" value={formatCents(built.subtotal + built.tax)} tone="strong" />
            {depositCents != null && Number.isFinite(depositCents) && depositCents > 0 && (
              <KeyValue label="Deposit requested" value={formatCents(depositCents)} />
            )}
            <div className="mt-4 space-y-3">
              <ErrorBanner message={action.error ?? (lines.some((l) => l.unitPrice) ? built.error : null)} />
              <Button className="w-full" onClick={submit} disabled={action.pending}>
                {action.pending ? 'Creating…' : 'Create sales order'}
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

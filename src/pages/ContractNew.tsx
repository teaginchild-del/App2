import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BackTitle, ErrorBanner, Field, KeyValue, Section } from '@/components/order-to-cash/layout'
import { CustomerSelect, MoneyInput, TermsSelect } from '@/components/order-to-cash/inputs'
import { parseMoney } from '@/components/order-to-cash/line-drafts'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { listProducts } from '@/lib/api/billing'
import { createContract, type ContractItemInput } from '@/lib/api/contracts'
import { listO2cCustomers } from '@/lib/api/o2c-shared'
import {
  addDays,
  addMonths,
  extend,
  isoDate,
  todayIso,
  type BillingFrequencyMonths,
  type BillingTiming,
  type RevenueTreatment,
} from '@/lib/billing-engine'
import { formatCents } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

interface ItemDraft {
  key: string
  productId: string
  description: string
  quantity: string
  unitPrice: string
  frequencyMonths: BillingFrequencyMonths
  timing: BillingTiming
  revenueTreatment: RevenueTreatment
}

const newItem = (): ItemDraft => ({
  key: crypto.randomUUID(),
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  frequencyMonths: 1,
  timing: 'advance',
  revenueTreatment: 'ratable',
})

export function ContractNew() {
  const navigate = useNavigate()
  const { data } = useAsync(() => Promise.all([listO2cCustomers(), listProducts()]), [])
  const [customers, products] = data ?? [[], []]

  const start = todayIso()
  const [customerId, setCustomerId] = useState('')
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(isoDate(addDays(addMonths(new Date(`${start}T00:00:00Z`), 12), -1)))
  const [terms, setTerms] = useState('Net 30')
  const [autoRenew, setAutoRenew] = useState(true)
  const [renewalTermMonths, setRenewalTermMonths] = useState('12')
  const [upliftPercent, setUpliftPercent] = useState('3')
  const [renewalLeadDays, setRenewalLeadDays] = useState('30')
  const [activate, setActivate] = useState(true)
  const [items, setItems] = useState<ItemDraft[]>([newItem()])
  const action = useAction()

  const update = (key: string, patch: Partial<ItemDraft>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const annual = items.reduce((sum, i) => {
    const price = parseMoney(i.unitPrice)
    return Number.isFinite(price) ? sum + extend(Number(i.quantity) || 0, price) * (12 / i.frequencyMonths) : sum
  }, 0)

  const submit = async () => {
    let id = ''
    const ok = await action.run(async () => {
      if (!customerId) throw new Error('Pick a customer')
      const parsed: ContractItemInput[] = items.map((i, n) => {
        const unitPriceCents = parseMoney(i.unitPrice)
        if (!Number.isFinite(unitPriceCents)) throw new Error(`Item ${n + 1}: enter a price`)
        return {
          productId: i.productId || null,
          description: i.description,
          quantity: Number(i.quantity),
          unitPriceCents,
          frequencyMonths: i.frequencyMonths,
          timing: i.timing,
          revenueTreatment: i.revenueTreatment,
        }
      })
      id = await createContract(
        {
          customerId,
          startDate,
          endDate,
          terms,
          autoRenew,
          renewalTermMonths: Number(renewalTermMonths),
          upliftPercent: Number(upliftPercent) || 0,
          renewalLeadDays: Number(renewalLeadDays) || 0,
          items: parsed,
        },
        { activate },
      )
    })
    if (ok) navigate(`/contracts/${id}`)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/contracts" label="Contracts">
            New Contract
          </BackTitle>
        }
        description="Each item bills on its own recurring schedule through the contract's sales order."
      />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Contract">
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
              <Field label="Payment terms">
                <TermsSelect value={terms} onChange={setTerms} />
              </Field>
              <Field label="Start date">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="End date">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Items">
            <div className="space-y-3">
              {items.map((item, n) => (
                <div
                  key={item.key}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-6"
                >
                  <Field label="Product" className="md:col-span-2">
                    <Select
                      value={item.productId}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value)
                        update(item.key, {
                          productId: e.target.value,
                          ...(p ? { description: p.name, unitPrice: (p.basePriceCents / 100).toFixed(2) } : {}),
                        })
                      }}
                    >
                      <option value="">Custom item</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Description" className="md:col-span-3">
                    <Input
                      value={item.description}
                      onChange={(e) => update(item.key, { description: e.target.value })}
                    />
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove item ${n + 1}`}
                      disabled={items.length === 1}
                      onClick={() => setItems((xs) => xs.filter((x) => x.key !== item.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Field label="Quantity">
                    <Input
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => update(item.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Price / unit / period">
                    <MoneyInput value={item.unitPrice} onChange={(v) => update(item.key, { unitPrice: v })} />
                  </Field>
                  <Field label="Bills">
                    <Select
                      value={String(item.frequencyMonths)}
                      onChange={(e) =>
                        update(item.key, { frequencyMonths: Number(e.target.value) as BillingFrequencyMonths })
                      }
                    >
                      <option value="1">Monthly</option>
                      <option value="3">Quarterly</option>
                      <option value="6">Semi-annually</option>
                      <option value="12">Annually</option>
                    </Select>
                  </Field>
                  <Field label="Timing">
                    <Select
                      value={item.timing}
                      onChange={(e) => update(item.key, { timing: e.target.value as BillingTiming })}
                    >
                      <option value="advance">In advance</option>
                      <option value="arrears">In arrears</option>
                    </Select>
                  </Field>
                  <Field label="Revenue" className="md:col-span-2">
                    <Select
                      value={item.revenueTreatment}
                      onChange={(e) => update(item.key, { revenueTreatment: e.target.value as RevenueTreatment })}
                    >
                      <option value="ratable">Ratably over each period</option>
                      <option value="point_in_time">When invoiced</option>
                    </Select>
                  </Field>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setItems((xs) => [...xs, newItem()])}>
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Renewal">
            <div className="space-y-3">
              <CheckboxField
                label="Auto-renew"
                description="A renewal contract and order are generated before the term ends."
                checked={autoRenew}
                onChange={(e) => setAutoRenew(e.target.checked)}
              />
              {autoRenew && (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Term (mo)">
                    <Input
                      inputMode="numeric"
                      value={renewalTermMonths}
                      onChange={(e) => setRenewalTermMonths(e.target.value)}
                    />
                  </Field>
                  <Field label="Uplift %">
                    <Input
                      inputMode="decimal"
                      value={upliftPercent}
                      onChange={(e) => setUpliftPercent(e.target.value)}
                    />
                  </Field>
                  <Field label="Lead days">
                    <Input
                      inputMode="numeric"
                      value={renewalLeadDays}
                      onChange={(e) => setRenewalLeadDays(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Section>
          <Section title="Summary">
            <KeyValue label="Annual value" value={formatCents(annual)} tone="strong" />
            <div className="mt-3">
              <CheckboxField
                label="Activate now"
                description="Creates the billing order so scheduled invoicing starts. Otherwise the contract stays a draft."
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
              />
            </div>
            <div className="mt-4 space-y-3">
              <ErrorBanner message={action.error} />
              <Button className="w-full" onClick={submit} disabled={action.pending}>
                {action.pending ? 'Creating…' : activate ? 'Create & activate' : 'Save draft'}
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

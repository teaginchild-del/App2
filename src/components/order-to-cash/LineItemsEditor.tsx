import { Plus, Trash2 } from 'lucide-react'
import { Field } from '@/components/order-to-cash/layout'
import { MoneyInput } from '@/components/order-to-cash/inputs'
import { emptyLine, type LineDraft, type ScheduleKind } from '@/components/order-to-cash/line-drafts'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { BillingFrequencyMonths, BillingTiming, ItemKind, RevenueTreatment } from '@/lib/billing-engine'
import type { Product } from '@/types/billing'

export function LineItemsEditor({
  lines,
  onChange,
  products,
  mode,
}: {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  products: Product[]
  /** Sales orders get item kinds and billing schedules; invoices bill immediately. */
  mode: 'sales_order' | 'invoice'
}) {
  const update = (key: string, patch: Partial<LineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const pickProduct = (line: LineDraft, productId: string) => {
    const product = products.find((p) => p.id === productId)
    update(line.key, {
      productId,
      ...(product
        ? {
            description: product.name,
            unitPrice: (product.basePriceCents / 100).toFixed(2),
            taxable: product.enableTaxes ?? line.taxable,
          }
        : {}),
    })
  }

  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div key={line.key} className="rounded-lg border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Line {index + 1}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
              disabled={lines.length === 1}
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Field label="Product" className="md:col-span-2">
              <Select value={line.productId} onChange={(e) => pickProduct(line, e.target.value)}>
                <option value="">Custom item</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" className="md:col-span-4">
              <Input value={line.description} onChange={(e) => update(line.key, { description: e.target.value })} />
            </Field>
            {mode === 'sales_order' && (
              <Field
                label="Item type"
                className="md:col-span-2"
                hint={line.itemKind === 'inventory' ? 'Bills as it ships' : 'Billable once approved'}
              >
                <Select
                  value={line.itemKind}
                  onChange={(e) => update(line.key, { itemKind: e.target.value as ItemKind })}
                >
                  <option value="service">Service</option>
                  <option value="non_inventory">Non-inventory</option>
                  <option value="inventory">Inventory (ships)</option>
                </Select>
              </Field>
            )}
            <Field label="Quantity">
              <Input
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
              />
            </Field>
            <Field label={line.schedule === 'recurring' ? 'Price / period' : 'Unit price'}>
              <MoneyInput value={line.unitPrice} onChange={(v) => update(line.key, { unitPrice: v })} />
            </Field>
            <Field label="Tax rate %">
              <Input
                inputMode="decimal"
                value={line.taxable ? line.taxRate : ''}
                disabled={!line.taxable}
                onChange={(e) => update(line.key, { taxRate: e.target.value })}
              />
            </Field>
            <div className="flex items-end pb-1">
              <CheckboxField
                label="Taxable"
                checked={line.taxable}
                onChange={(e) => update(line.key, { taxable: e.target.checked })}
              />
            </div>

            <Field label="Revenue recognition" className="md:col-span-2">
              <Select
                value={line.revenueTreatment}
                onChange={(e) => update(line.key, { revenueTreatment: e.target.value as RevenueTreatment })}
              >
                <option value="point_in_time">When invoiced</option>
                <option value="ratable">Ratably over service period</option>
              </Select>
            </Field>
            {line.revenueTreatment === 'ratable' && line.schedule !== 'recurring' && (
              <>
                <Field label="Service start" className="md:col-span-2">
                  <Input
                    type="date"
                    value={line.revRecStart}
                    onChange={(e) => update(line.key, { revRecStart: e.target.value })}
                  />
                </Field>
                <Field label="Service end" className="md:col-span-2">
                  <Input
                    type="date"
                    value={line.revRecEnd}
                    onChange={(e) => update(line.key, { revRecEnd: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>

          {mode === 'sales_order' && <ScheduleFields line={line} update={(patch) => update(line.key, patch)} />}
        </div>
      ))}

      <Button variant="secondary" size="sm" onClick={() => onChange([...lines, emptyLine()])}>
        <Plus className="h-4 w-4" />
        Add line
      </Button>
    </div>
  )
}

function ScheduleFields({ line, update }: { line: LineDraft; update: (patch: Partial<LineDraft>) => void }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-6">
      <Field label="Billing schedule" className="md:col-span-2">
        <Select value={line.schedule} onChange={(e) => update({ schedule: e.target.value as ScheduleKind })}>
          <option value="none">{line.itemKind === 'inventory' ? 'Bill as fulfilled' : 'Bill when approved'}</option>
          <option value="one_time">One-time on a date</option>
          <option value="installments">Installments</option>
          <option value="milestones">Milestones</option>
          <option value="recurring">Recurring</option>
        </Select>
      </Field>

      {line.schedule === 'one_time' && (
        <Field label="Bill date" className="md:col-span-2">
          <Input type="date" value={line.oneTimeDate} onChange={(e) => update({ oneTimeDate: e.target.value })} />
        </Field>
      )}

      {line.schedule === 'installments' && (
        <>
          <Field label="Installments">
            <Input
              inputMode="numeric"
              value={line.installmentCount}
              onChange={(e) => update({ installmentCount: e.target.value })}
            />
          </Field>
          <Field label="Every (months)">
            <Input
              inputMode="numeric"
              value={line.installmentInterval}
              onChange={(e) => update({ installmentInterval: e.target.value })}
            />
          </Field>
          <Field label="First bill date" className="md:col-span-2">
            <Input
              type="date"
              value={line.installmentFirstDate}
              onChange={(e) => update({ installmentFirstDate: e.target.value })}
            />
          </Field>
        </>
      )}

      {line.schedule === 'recurring' && (
        <>
          <Field label="Frequency">
            <Select
              value={String(line.frequencyMonths)}
              onChange={(e) => update({ frequencyMonths: Number(e.target.value) as BillingFrequencyMonths })}
            >
              <option value="1">Monthly</option>
              <option value="3">Quarterly</option>
              <option value="6">Semi-annual</option>
              <option value="12">Annual</option>
            </Select>
          </Field>
          <Field label="Timing">
            <Select value={line.timing} onChange={(e) => update({ timing: e.target.value as BillingTiming })}>
              <option value="advance">In advance</option>
              <option value="arrears">In arrears</option>
            </Select>
          </Field>
          <Field label="Service start">
            <Input type="date" value={line.serviceStart} onChange={(e) => update({ serviceStart: e.target.value })} />
          </Field>
          <Field label="Service end">
            <Input type="date" value={line.serviceEnd} onChange={(e) => update({ serviceEnd: e.target.value })} />
          </Field>
        </>
      )}

      {line.schedule === 'milestones' && (
        <div className="space-y-2 md:col-span-6">
          {line.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={m.name}
                placeholder="Milestone name"
                onChange={(e) =>
                  update({ milestones: line.milestones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                }
              />
              <div className="w-28">
                <Input
                  inputMode="decimal"
                  value={m.percent}
                  placeholder="%"
                  onChange={(e) =>
                    update({
                      milestones: line.milestones.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)),
                    })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove milestone"
                disabled={line.milestones.length === 1}
                onClick={() => update({ milestones: line.milestones.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ milestones: [...line.milestones, { name: '', percent: '' }] })}
          >
            <Plus className="h-4 w-4" />
            Add milestone
          </Button>
          <p className="text-xs text-ink-subtle">
            Percentages must total 100. Each milestone bills when you mark it complete.
          </p>
        </div>
      )}
    </div>
  )
}

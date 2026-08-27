import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ProductFamilyDialog } from '@/components/products/ProductFamilyDialog'
import { createProduct, listProductFamilies } from '@/lib/api/catalog'
import type { CatalogIntervalUnit, ProductFamily, TermIntervalUnit } from '@/types/billing'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  )
}

function CurrencyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">$</span>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className="pl-6"
      />
    </div>
  )
}

function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

export function ProductNew() {
  const navigate = useNavigate()

  const [families, setFamilies] = useState<ProductFamily[]>([])
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false)
  const [loadingFamilies, setLoadingFamilies] = useState(true)

  // Product details
  const [productFamilyId, setProductFamilyId] = useState('')
  const [name, setName] = useState('')
  const [apiHandle, setApiHandle] = useState('')
  const [accountingCode, setAccountingCode] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [department, setDepartment] = useState('')
  const [description, setDescription] = useState('')
  const [enableTaxes, setEnableTaxes] = useState(false)
  const [requirePaymentMethod, setRequirePaymentMethod] = useState(false)
  const [requireBillingAddress, setRequireBillingAddress] = useState(false)
  const [createV2SignupPage, setCreateV2SignupPage] = useState(false)
  const [enableUrlParams, setEnableUrlParams] = useState(false)

  // Product pricing
  const [basePrice, setBasePrice] = useState('')
  const [occurs, setOccurs] = useState('1')
  const [intervalUnit, setIntervalUnit] = useState<CatalogIntervalUnit>('month')
  const [taxIncluded, setTaxIncluded] = useState(false)

  const [hasTrial, setHasTrial] = useState(false)
  const [trialInterval, setTrialInterval] = useState('1')
  const [trialIntervalUnit, setTrialIntervalUnit] = useState<CatalogIntervalUnit>('month')
  const [trialPrice, setTrialPrice] = useState('')

  const [hasSetupFee, setHasSetupFee] = useState(false)
  const [setupFee, setSetupFee] = useState('')

  const [hasTerm, setHasTerm] = useState(false)
  const [termInterval, setTermInterval] = useState('12')
  const [termIntervalUnit, setTermIntervalUnit] = useState<TermIntervalUnit>('month')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFamilies = () => {
    setLoadingFamilies(true)
    listProductFamilies()
      .then((list) => {
        setFamilies(list)
        setProductFamilyId((current) => current || list[0]?.id || '')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load product families.'))
      .finally(() => setLoadingFamilies(false))
  }

  useEffect(loadFamilies, [])

  const valid = productFamilyId.trim() !== '' && name.trim() !== '' && Number.parseInt(occurs, 10) > 0

  const handleSubmit = async () => {
    if (!valid) return
    setSubmitting(true)
    setError(null)
    try {
      const product = await createProduct({
        productFamilyId,
        name: name.trim(),
        apiHandle: apiHandle.trim() || undefined,
        accountingCode: accountingCode.trim() || undefined,
        itemCategory: itemCategory.trim() || undefined,
        department: department.trim() || undefined,
        description: description.trim() || undefined,
        enableTaxes,
        requirePaymentMethod,
        requireBillingAddress,
        createV2SignupPage,
        enableUrlParams,

        basePriceCents: dollarsToCents(basePrice),
        priceInterval: Number.parseInt(occurs, 10) || 1,
        priceIntervalUnit: intervalUnit,
        taxIncluded,

        hasTrial,
        trialInterval: hasTrial ? Number.parseInt(trialInterval, 10) || 1 : null,
        trialIntervalUnit: hasTrial ? trialIntervalUnit : null,
        trialPriceCents: hasTrial ? dollarsToCents(trialPrice) : null,

        hasSetupFee,
        setupFeeCents: hasSetupFee ? dollarsToCents(setupFee) : null,

        hasTerm,
        termInterval: hasTerm ? Number.parseInt(termInterval, 10) || 1 : null,
        termIntervalUnit: hasTerm ? termIntervalUnit : null,
      })
      navigate('/products', { state: { createdProductId: product.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="New Product"
        description="Define what customers see and how it's priced."
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
            Cancel
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink">Product Details</h2>
            <p className="mt-1 text-sm text-ink-muted">Basic information shown across the catalog and signup pages.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex-1">
                    <Field label="Product Family">
                      <Select
                        value={productFamilyId}
                        onChange={(e) => setProductFamilyId(e.target.value)}
                        disabled={loadingFamilies}
                      >
                        <option value="" disabled>
                          {loadingFamilies ? 'Loading families...' : 'Select a product family'}
                        </option>
                        {families.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setFamilyDialogOpen(true)}>
                    New Family
                  </Button>
                </div>
                {!loadingFamilies && families.length === 0 && (
                  <p className="mt-1 text-xs text-warning-700">
                    Create a product family before adding a product.
                  </p>
                )}
              </div>

              <Field label="Product Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ledger Pro" />
              </Field>

              <Field label="API Handle" hint="Optional — used to reference this product from the API.">
                <Input value={apiHandle} onChange={(e) => setApiHandle(e.target.value)} placeholder="ledger-pro" />
              </Field>

              <Field label="Accounting Code" hint="Optional">
                <Input value={accountingCode} onChange={(e) => setAccountingCode(e.target.value)} placeholder="REV-LEDGER" />
              </Field>

              <Field label="Item Category" hint="Optional">
                <Input value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} placeholder="Software" />
              </Field>

              <Field label="Department" hint="Optional">
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Finance" />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Description" hint="Optional">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="What customers are buying..."
                  />
                </Field>
              </div>
            </div>

            <div className="mt-5 space-y-1 border-t border-slate-100 pt-4">
              <CheckboxField
                id="enable-taxes"
                checked={enableTaxes}
                onChange={(e) => setEnableTaxes(e.target.checked)}
                label="Enable taxes"
              />
              <CheckboxField
                id="require-payment-method"
                checked={requirePaymentMethod}
                onChange={(e) => setRequirePaymentMethod(e.target.checked)}
                label="Require payment method"
              />
              <CheckboxField
                id="require-billing-address"
                checked={requireBillingAddress}
                onChange={(e) => setRequireBillingAddress(e.target.checked)}
                label="Require a shipping or billing address"
              />
              <CheckboxField
                id="create-v2-signup-page"
                checked={createV2SignupPage}
                onChange={(e) => setCreateV2SignupPage(e.target.checked)}
                label="Create modern v2 public signup page"
              />
              <CheckboxField
                id="enable-url-params"
                checked={enableUrlParams}
                onChange={(e) => setEnableUrlParams(e.target.checked)}
                label="Enable URL and return parameter fields"
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink">Product Pricing</h2>
            <p className="mt-1 text-sm text-ink-muted">How and how often this product bills.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Base Price">
                <CurrencyInput value={basePrice} onChange={setBasePrice} />
              </Field>

              <Field label="Occurs">
                <Input
                  type="number"
                  min={1}
                  value={occurs}
                  onChange={(e) => setOccurs(e.target.value)}
                  placeholder="1"
                />
              </Field>

              <Field label="Interval">
                <Select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as CatalogIntervalUnit)}>
                  <option value="month">Month(s)</option>
                  <option value="day">Day(s)</option>
                </Select>
              </Field>
            </div>

            <div className="mt-4">
              <span className="mb-1 block text-sm font-medium text-ink">Tax included in price?</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="tax-included"
                    checked={!taxIncluded}
                    onChange={() => setTaxIncluded(false)}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500"
                  />
                  No
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="tax-included"
                    checked={taxIncluded}
                    onChange={() => setTaxIncluded(true)}
                    className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500"
                  />
                  Yes
                </label>
              </div>
            </div>

            <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
              <div>
                <CheckboxField
                  id="add-trial"
                  checked={hasTrial}
                  onChange={(e) => setHasTrial(e.target.checked)}
                  label="Add trial"
                />
                {hasTrial && (
                  <div className="mt-3 grid grid-cols-1 gap-4 pl-6 sm:grid-cols-3">
                    <Field label="Trial Interval">
                      <Input
                        type="number"
                        min={1}
                        value={trialInterval}
                        onChange={(e) => setTrialInterval(e.target.value)}
                      />
                    </Field>
                    <Field label="Interval">
                      <Select
                        value={trialIntervalUnit}
                        onChange={(e) => setTrialIntervalUnit(e.target.value as CatalogIntervalUnit)}
                      >
                        <option value="month">Month(s)</option>
                        <option value="day">Day(s)</option>
                      </Select>
                    </Field>
                    <Field label="Trial Price">
                      <CurrencyInput value={trialPrice} onChange={setTrialPrice} />
                    </Field>
                  </div>
                )}
              </div>

              <div>
                <CheckboxField
                  id="add-setup-fee"
                  checked={hasSetupFee}
                  onChange={(e) => setHasSetupFee(e.target.checked)}
                  label="Add setup fee"
                />
                {hasSetupFee && (
                  <div className="mt-3 max-w-xs pl-6">
                    <Field label="Setup Fee">
                      <CurrencyInput value={setupFee} onChange={setSetupFee} />
                    </Field>
                  </div>
                )}
              </div>

              <div>
                <CheckboxField
                  id="add-term-interval"
                  checked={hasTerm}
                  onChange={(e) => setHasTerm(e.target.checked)}
                  label="Add term interval"
                  description="Commits the customer to a minimum contract length."
                />
                {hasTerm && (
                  <div className="mt-3 grid grid-cols-1 gap-4 pl-6 sm:grid-cols-2">
                    <Field label="Term Interval">
                      <Input
                        type="number"
                        min={1}
                        value={termInterval}
                        onChange={(e) => setTermInterval(e.target.value)}
                      />
                    </Field>
                    <Field label="Interval">
                      <Select
                        value={termIntervalUnit}
                        onChange={(e) => setTermIntervalUnit(e.target.value as TermIntervalUnit)}
                      >
                        <option value="month">Month(s)</option>
                        <option value="day">Day(s)</option>
                        <option value="year">Year(s)</option>
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </section>

          {error && <p className="text-sm text-danger-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pb-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!valid || submitting}>
              {submitting ? 'Creating Product...' : 'Create Product'}
            </Button>
          </div>
        </div>
      </div>

      <ProductFamilyDialog
        open={familyDialogOpen}
        onClose={() => setFamilyDialogOpen(false)}
        onCreated={(family) => {
          setFamilyDialogOpen(false)
          setFamilies((prev) => [...prev, family].sort((a, b) => a.name.localeCompare(b.name)))
          setProductFamilyId(family.id)
        }}
      />
    </div>
  )
}

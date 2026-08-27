import { Minus, Plus, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { basePriceCents, summarizePricing } from '@/lib/billing-calculations'
import { formatCurrency } from '@/lib/format'
import { listPricePoints, listProducts } from '@/lib/api/billing'
import type { Component, Product } from '@/types/billing'
import { ComponentPickerModal } from '@/components/subscriptions/wizard/ComponentPickerModal'
import { CouponPickerModal } from '@/components/subscriptions/wizard/CouponPickerModal'
import type { WizardState } from '@/components/subscriptions/wizard/types'

interface Step2Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

export function Step2Configure({ state, update }: Step2Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [componentPickerOpen, setComponentPickerOpen] = useState(false)
  const [couponPickerOpen, setCouponPickerOpen] = useState(false)
  const [customPriceInput, setCustomPriceInput] = useState(
    state.customPriceCents !== null ? (state.customPriceCents / 100).toString() : '',
  )

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .finally(() => setLoadingProducts(false))
  }, [])

  const handleProductChange = async (productId: string) => {
    const product = products.find((p) => p.id === productId) ?? null
    update({
      product,
      pricePoints: [],
      productPricePointId: null,
      isCustomPrice: false,
      customPriceCents: null,
      selectedComponents: [],
      coupon: null,
    })
    if (!product) return
    const pricePoints = await listPricePoints(product.id)
    const defaultPoint = pricePoints.find((p) => p.isDefault) ?? pricePoints[0] ?? null
    update({ pricePoints, productPricePointId: defaultPoint?.id ?? null })
  }

  const base = state.product
    ? basePriceCents(
        state.pricePoints.find((p) => p.id === state.productPricePointId) ?? null,
        state.isCustomPrice,
        state.customPriceCents,
        state.product.basePriceCents,
      )
    : 0

  const summary = summarizePricing(base, state.selectedComponents.map((sc) => ({ component: sc.component, quantity: sc.quantity, priceOverrideCents: null })), state.coupon)

  const addComponent = (component: Component) => {
    if (state.selectedComponents.some((sc) => sc.component.id === component.id)) return
    update({ selectedComponents: [...state.selectedComponents, { component, quantity: 1 }] })
  }

  const updateQuantity = (componentId: string, quantity: number) => {
    update({
      selectedComponents: state.selectedComponents.map((sc) =>
        sc.component.id === componentId ? { ...sc, quantity: Math.max(1, quantity) } : sc,
      ),
    })
  }

  const removeComponent = (componentId: string) => {
    update({ selectedComponents: state.selectedComponents.filter((sc) => sc.component.id !== componentId) })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Product</label>
          <Select
            value={state.product?.id ?? ''}
            onChange={(e) => handleProductChange(e.target.value)}
            disabled={loadingProducts}
          >
            <option value="" disabled>
              {loadingProducts ? 'Loading products...' : 'Select a product'}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        {state.product && (
          <>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-ink-muted">Pricing</label>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      isCustomPrice: !state.isCustomPrice,
                      customPriceCents: !state.isCustomPrice
                        ? Math.round(parseFloat(customPriceInput || '0') * 100) || base
                        : null,
                    })
                  }
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {state.isCustomPrice ? 'Use catalog pricing' : 'Custom Pricing'}
                </button>
              </div>

              {state.isCustomPrice ? (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">
                    $
                  </span>
                  <Input
                    className="pl-6"
                    inputMode="decimal"
                    value={customPriceInput}
                    onChange={(e) => {
                      setCustomPriceInput(e.target.value)
                      const parsed = Math.round(parseFloat(e.target.value || '0') * 100)
                      update({ customPriceCents: Number.isFinite(parsed) ? parsed : 0 })
                    }}
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <Select
                  value={state.productPricePointId ?? ''}
                  onChange={(e) => update({ productPricePointId: e.target.value })}
                >
                  {state.pricePoints.length === 0 && <option value="">Standard — {formatCurrency(state.product.basePriceCents / 100)}</option>}
                  {state.pricePoints.map((pp) => (
                    <option key={pp.id} value={pp.id}>
                      {pp.name} — {formatCurrency(pp.priceCents / 100)} / {pp.billingInterval}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-medium text-ink-muted">Components</label>
                <Button type="button" size="sm" variant="outline" onClick={() => setComponentPickerOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Component
                </Button>
              </div>
              {state.selectedComponents.length > 0 && (
                <ul className="space-y-2">
                  {state.selectedComponents.map((sc) => (
                    <li
                      key={sc.component.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{sc.component.name}</div>
                        <div className="text-xs text-ink-subtle">
                          {formatCurrency(sc.component.priceCents / 100)}
                          {sc.component.pricingScheme === 'per_unit' ? ` / ${sc.component.unitName ?? 'unit'}` : ' flat'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sc.component.pricingScheme === 'per_unit' && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(sc.component.id, sc.quantity - 1)}
                              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-ink-subtle hover:bg-slate-50"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-sm text-ink">{sc.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(sc.component.id, sc.quantity + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-ink-subtle hover:bg-slate-50"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeComponent(sc.component.id)}
                          className="text-ink-subtle hover:text-danger-600"
                          aria-label={`Remove ${sc.component.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-medium text-ink-muted">Coupon</label>
                {!state.coupon && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setCouponPickerOpen(true)}>
                    <Tag className="h-3.5 w-3.5" />
                    Add Coupon
                  </Button>
                )}
              </div>
              {state.coupon && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <Tag className="h-4 w-4 text-brand-600" />
                    {state.coupon.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => update({ coupon: null })}
                    className="text-ink-subtle hover:text-danger-600"
                    aria-label="Remove coupon"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Pricing Summary</h4>
        {!state.product ? (
          <p className="text-sm text-ink-muted">Select a product to see pricing.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <Row label={state.isCustomPrice ? 'Custom price' : 'Base price'} value={formatCurrency(summary.baseCents / 100)} />
            {state.selectedComponents.map((sc) => (
              <Row
                key={sc.component.id}
                label={`${sc.component.name}${sc.component.pricingScheme === 'per_unit' ? ` × ${sc.quantity}` : ''}`}
                value={formatCurrency(
                  (sc.component.pricingScheme === 'flat' ? sc.component.priceCents : sc.component.priceCents * sc.quantity) / 100,
                )}
              />
            ))}
            {summary.discountCents > 0 && (
              <Row label={`Coupon (${state.coupon?.name})`} value={`− ${formatCurrency(summary.discountCents / 100)}`} tone="success" />
            )}
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-semibold text-ink">Effective recurring price</span>
              <span className="text-lg font-semibold text-ink">{formatCurrency(summary.effectiveRecurringCents / 100)}</span>
            </div>
          </div>
        )}
      </div>

      <ComponentPickerModal
        open={componentPickerOpen}
        onClose={() => setComponentPickerOpen(false)}
        productId={state.product?.id ?? null}
        selected={state.selectedComponents}
        onAdd={addComponent}
      />
      <CouponPickerModal
        open={couponPickerOpen}
        onClose={() => setCouponPickerOpen(false)}
        onApply={(coupon) => {
          update({ coupon })
          setCouponPickerOpen(false)
        }}
      />
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-ink-muted">{label}</span>
      <span className={tone === 'success' ? 'shrink-0 font-medium text-success-700' : 'shrink-0 text-ink'}>{value}</span>
    </div>
  )
}

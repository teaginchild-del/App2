import { ArrowLeft, Building2, CalendarClock, CalendarRange, Package, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { SubscriptionStatusBadge } from '@/components/subscriptions/StatusBadge'
import { Button } from '@/components/ui/button'
import { basePriceCents, summarizePricing } from '@/lib/billing-calculations'
import { formatCurrency, formatDate } from '@/lib/format'
import { getSubscription } from '@/lib/api/billing'
import type { SubscriptionWithRelations } from '@/types/billing'

export function SubscriptionDetail() {
  const { subscriptionId } = useParams()
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState<SubscriptionWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!subscriptionId) return
    setLoading(true)
    getSubscription(subscriptionId)
      .then(setSubscription)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load subscription.'))
      .finally(() => setLoading(false))
  }, [subscriptionId])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading subscription...</div>
  }

  if (error || !subscription) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-danger-600">
        {error ?? 'Subscription not found.'}
        <Button variant="secondary" size="sm" onClick={() => navigate('/subscriptions')}>
          Back to Subscriptions
        </Button>
      </div>
    )
  }

  const base = basePriceCents(
    subscription.productPricePoint,
    subscription.isCustomPrice,
    subscription.customPriceCents,
    subscription.product.basePriceCents,
  )
  const coupon = subscription.coupons[0]?.coupon ?? null
  const summary = summarizePricing(
    base,
    subscription.components.map((c) => ({
      component: c.component!,
      quantity: c.quantity,
      priceOverrideCents: c.priceOverrideCents,
    })),
    coupon,
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <button
              onClick={() => navigate('/subscriptions')}
              className="rounded-md p-1 text-ink-subtle hover:bg-slate-100 hover:text-ink"
              aria-label="Back to Subscriptions"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {subscription.product.name}
          </span>
        }
        description={`Subscription for ${subscription.customer.companyName}`}
        actions={<SubscriptionStatusBadge status={subscription.status} />}
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Customer & Product">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow icon={Building2} label="Customer" value={subscription.customer.companyName} />
              <InfoRow icon={Package} label="Product" value={subscription.product.name} />
              {subscription.customer.contactName && (
                <InfoRow icon={Building2} label="Primary Contact" value={subscription.customer.contactName} />
              )}
              {subscription.productPricePoint && (
                <InfoRow icon={Package} label="Price Point" value={subscription.productPricePoint.name} />
              )}
            </div>
          </Section>

          <Section title="Pricing Breakdown">
            <div className="space-y-2 text-sm">
              <Row label={subscription.isCustomPrice ? 'Custom price' : 'Base price'} value={formatCurrency(summary.baseCents / 100)} />
              {subscription.components.map((c) => (
                <Row
                  key={c.componentId}
                  label={`${c.component?.name}${c.component?.pricingScheme === 'per_unit' ? ` × ${c.quantity}` : ''}`}
                  value={formatCurrency(
                    ((c.component?.pricingScheme === 'flat' ? c.component.priceCents : (c.component?.priceCents ?? 0) * c.quantity)) / 100,
                  )}
                />
              ))}
              {coupon && (
                <Row label={`Coupon: ${coupon.name}`} value={`− ${formatCurrency(summary.discountCents / 100)}`} tone="success" />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-sm font-semibold text-ink">Effective recurring price</span>
                <span className="text-lg font-semibold text-ink">{formatCurrency(summary.effectiveRecurringCents / 100)}</span>
              </div>
            </div>
          </Section>

          {subscription.components.length > 0 && (
            <Section title="Components">
              <ul className="divide-y divide-slate-100">
                {subscription.components.map((c) => (
                  <li key={c.componentId} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink">{c.component?.name}</span>
                    <span className="text-ink-subtle">
                      {c.quantity} {c.component?.pricingScheme === 'per_unit' ? (c.component.unitName ?? 'unit') : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Term">
            <InfoRow
              icon={CalendarRange}
              label="Term Type"
              value={subscription.termType === 'term' ? 'Fixed Term' : 'Evergreen'}
            />
            <InfoRow icon={CalendarClock} label="Start Date" value={formatDate(subscription.termStartDate)} />
            {subscription.termEndDate && <InfoRow icon={CalendarClock} label="End Date" value={formatDate(subscription.termEndDate)} />}
            <InfoRow icon={CalendarClock} label="First Billing Date" value={formatDate(subscription.firstBillingDate)} />
            <InfoRow icon={CalendarClock} label="Order Date" value={formatDate(subscription.orderDate)} />
          </Section>

          {coupon && (
            <Section title="Coupon">
              <InfoRow icon={Tag} label={coupon.name} value={coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `${formatCurrency(coupon.discountValue / 100)} off`} />
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h3>
      {children}
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
      <div className="min-w-0">
        <div className="text-xs text-ink-subtle">{label}</div>
        <div className="truncate text-ink">{value}</div>
      </div>
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

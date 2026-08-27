import { CreditCard, Plus, TrendingUp, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscriptionColumns } from '@/components/subscriptions/columns'
import { DataTable } from '@/components/data-table/DataTable'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { basePriceCents, summarizePricing } from '@/lib/billing-calculations'
import { formatCurrency } from '@/lib/format'
import { listSubscriptions } from '@/lib/api/billing'
import type { SubscriptionWithRelations } from '@/types/billing'

export function Subscriptions() {
  const navigate = useNavigate()
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSubscriptions()
      .then(setSubscriptions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load subscriptions.'))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const active = subscriptions.filter((s) => s.status === 'active')
    const canceled = subscriptions.filter((s) => s.status === 'canceled')
    const totalMrr = active.reduce((sum, s) => {
      const base = basePriceCents(s.productPricePoint, s.isCustomPrice, s.customPriceCents, s.product.basePriceCents)
      const summary = summarizePricing(
        base,
        s.components.map((c) => ({ component: c.component!, quantity: c.quantity, priceOverrideCents: c.priceOverrideCents })),
        s.coupons[0]?.coupon ?? null,
      )
      return sum + summary.effectiveRecurringCents
    }, 0)
    return { total: subscriptions.length, active: active.length, canceled: canceled.length, totalMrr }
  }, [subscriptions])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Subscriptions"
        description="Recurring subscriptions for your customers."
        actions={
          <Button size="sm" onClick={() => navigate('/subscriptions/new')}>
            <Plus className="h-4 w-4" />
            New Subscription
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Total Subscriptions" value={stats.total.toString()} icon={CreditCard} />
        <StatCard label="Active Recurring Revenue" value={formatCurrency(stats.totalMrr / 100)} icon={TrendingUp} tone="success" />
        <StatCard label="Canceled" value={stats.canceled.toString()} icon={XCircle} />
      </div>

      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-danger-600">{error}</div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading subscriptions...</div>
          ) : (
            <DataTable
              columns={subscriptionColumns}
              data={subscriptions}
              searchPlaceholder="Search subscriptions by customer or product..."
              onRowClick={(sub) => navigate(`/subscriptions/${sub.id}`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

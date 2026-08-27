import type { ColumnDef } from '@tanstack/react-table'
import { SubscriptionStatusBadge } from '@/components/subscriptions/StatusBadge'
import { basePriceCents, summarizePricing } from '@/lib/billing-calculations'
import { formatCurrency, formatDate, initials } from '@/lib/format'
import type { SubscriptionWithRelations } from '@/types/billing'

function effectivePriceCents(sub: SubscriptionWithRelations): number {
  const base = basePriceCents(sub.productPricePoint, sub.isCustomPrice, sub.customPriceCents, sub.product.basePriceCents)
  const summary = summarizePricing(
    base,
    sub.components.map((c) => ({
      component: c.component!,
      quantity: c.quantity,
      priceOverrideCents: c.priceOverrideCents,
    })),
    sub.coupons[0]?.coupon ?? null,
  )
  return summary.effectiveRecurringCents
}

export const subscriptionColumns: ColumnDef<SubscriptionWithRelations>[] = [
  {
    id: 'customer',
    accessorFn: (row) => `${row.customer.companyName} ${row.customer.contactName ?? ''} ${row.product.name}`,
    header: 'Customer',
    cell: ({ row }) => {
      const sub = row.original
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials(sub.customer.companyName)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{sub.customer.companyName}</div>
            <div className="truncate text-xs text-ink-subtle">{sub.product.name}</div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <SubscriptionStatusBadge status={row.original.status} />,
  },
  {
    id: 'price',
    header: 'Recurring Price',
    cell: ({ row }) => formatCurrency(effectivePriceCents(row.original) / 100),
  },
  {
    accessorKey: 'termType',
    header: 'Term',
    cell: ({ row }) => (row.original.termType === 'term' ? 'Term' : 'Evergreen'),
  },
  {
    accessorKey: 'termStartDate',
    header: 'Start Date',
    cell: ({ row }) => formatDate(row.original.termStartDate),
  },
  {
    accessorKey: 'firstBillingDate',
    header: 'First Billing',
    cell: ({ row }) => formatDate(row.original.firstBillingDate),
  },
  {
    accessorKey: 'orderDate',
    header: 'Order Date',
    cell: ({ row }) => formatDate(row.original.orderDate),
  },
]

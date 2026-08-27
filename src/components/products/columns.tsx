import type { ColumnDef } from '@tanstack/react-table'
import { ProductStatusBadge } from '@/components/products/StatusBadge'
import { formatCurrency } from '@/lib/format'
import type { Product } from '@/types/billing'

export type ProductRow = Product & { familyName: string }

function priceIntervalLabel(product: Product): string {
  const occurs = product.priceInterval ?? 1
  const unit = product.priceIntervalUnit === 'day' ? 'day' : 'month'
  const unitLabel = `${unit}${occurs === 1 ? '' : 's'}`
  return occurs === 1 ? `every ${unitLabel}` : `every ${occurs} ${unitLabel}`
}

export const productColumns: ColumnDef<ProductRow>[] = [
  {
    id: 'name',
    accessorFn: (row) => `${row.name} ${row.apiHandle ?? ''} ${row.familyName}`,
    header: 'Product',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{row.original.name}</div>
        {row.original.apiHandle && (
          <div className="truncate text-xs text-ink-subtle">{row.original.apiHandle}</div>
        )}
      </div>
    ),
  },
  {
    id: 'family',
    accessorFn: (row) => row.familyName,
    header: 'Product Family',
    cell: ({ row }) => row.original.familyName,
  },
  {
    id: 'price',
    header: 'Base Price',
    cell: ({ row }) => (
      <div>
        <div>{formatCurrency(row.original.basePriceCents / 100)}</div>
        <div className="text-xs text-ink-subtle">{priceIntervalLabel(row.original)}</div>
      </div>
    ),
  },
  {
    accessorKey: 'accountingCode',
    header: 'Accounting Code',
    cell: ({ row }) => row.original.accountingCode ?? '—',
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <ProductStatusBadge isActive={row.original.isActive} />,
  },
]

import type { ColumnDef } from '@tanstack/react-table'
import { StatusBadge } from '@/components/customers/StatusBadge'
import { formatCurrency, formatDate, initials } from '@/lib/format'
import type { Customer } from '@/types/customer'

export const customerColumns: ColumnDef<Customer>[] = [
  {
    accessorKey: 'companyName',
    header: 'Company',
    cell: ({ row }) => {
      const customer = row.original
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials(customer.companyName)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{customer.companyName}</div>
            <div className="truncate text-xs text-ink-subtle">{customer.customerNumber}</div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: 'contactName',
    header: 'Primary Contact',
    cell: ({ row }) => (
      <div>
        <div className="text-ink">{row.original.contactName}</div>
        <div className="text-xs text-ink-subtle">{row.original.email}</div>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'plan',
    header: 'Plan',
  },
  {
    accessorKey: 'mrr',
    header: 'MRR',
    cell: ({ row }) => formatCurrency(row.original.mrr, row.original.currency),
  },
  {
    accessorKey: 'balanceDue',
    header: 'Balance Due',
    cell: ({ row }) => {
      const balance = row.original.balanceDue
      return (
        <span className={balance > 0 ? 'font-medium text-danger-600' : 'text-ink-subtle'}>
          {formatCurrency(balance, row.original.currency)}
        </span>
      )
    },
  },
  {
    accessorKey: 'nextBillingDate',
    header: 'Next Billing',
    cell: ({ row }) => formatDate(row.original.nextBillingDate),
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
  },
]

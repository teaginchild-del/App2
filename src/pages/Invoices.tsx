import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, FileText, Plus, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/data-table/DataTable'
import { PageHeader } from '@/components/layout/PageHeader'
import { ListCard } from '@/components/order-to-cash/layout'
import { InvoiceStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { listInvoices } from '@/lib/api/invoicing'
import { todayIso } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'
import type { Invoice } from '@/types/billing'

const isOpen = (inv: Invoice) => inv.status === 'open' || inv.status === 'partially_paid'

const columns: ColumnDef<Invoice>[] = [
  {
    id: 'invoice',
    accessorFn: (inv) => `${inv.invoiceNumber} ${inv.customer?.companyName ?? ''} ${inv.memo ?? ''}`,
    header: 'Invoice',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium text-ink">{row.original.invoiceNumber}</div>
        <div className="truncate text-xs text-ink-subtle">{row.original.customer?.companyName}</div>
      </div>
    ),
  },
  { accessorKey: 'issueDate', header: 'Date', cell: ({ row }) => formatDate(row.original.issueDate) },
  {
    accessorKey: 'dueDate',
    header: 'Due',
    cell: ({ row }) => {
      const inv = row.original
      if (!inv.dueDate) return '—'
      const overdue = isOpen(inv) && inv.dueDate < todayIso()
      return <span className={overdue ? 'font-medium text-danger-600' : ''}>{formatDate(inv.dueDate)}</span>
    },
  },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
  { accessorKey: 'totalCents', header: 'Total', cell: ({ row }) => formatCents(row.original.totalCents) },
  { accessorKey: 'balanceCents', header: 'Balance', cell: ({ row }) => formatCents(row.original.balanceCents) },
]

export function Invoices() {
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(() => listInvoices(), [])
  const invoices = useMemo(() => data ?? [], [data])

  const stats = useMemo(() => {
    const today = todayIso()
    const open = invoices.filter(isOpen)
    return {
      outstanding: open.reduce((sum, i) => sum + i.balanceCents, 0),
      overdue: open.filter((i) => i.dueDate && i.dueDate < today).reduce((sum, i) => sum + i.balanceCents, 0),
      drafts: invoices.filter((i) => i.status === 'draft').length,
    }
  }, [invoices])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Invoices"
        description="Invoices billed from sales orders, contracts, subscriptions, or created on their own."
        actions={
          <Button size="sm" onClick={() => navigate('/invoices/new')}>
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Outstanding A/R" value={formatCents(stats.outstanding)} icon={Wallet} />
        <StatCard
          label="Overdue"
          value={formatCents(stats.overdue)}
          icon={AlertTriangle}
          tone={stats.overdue ? 'danger' : 'default'}
        />
        <StatCard label="Drafts to Issue" value={stats.drafts.toString()} icon={FileText} />
      </div>
      <ListCard loading={loading} error={error}>
        <DataTable
          columns={columns}
          data={invoices}
          searchPlaceholder="Search by invoice number or customer..."
          onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
        />
      </ListCard>
    </div>
  )
}

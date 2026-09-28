import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardList, Clock, Plus, Receipt } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/data-table/DataTable'
import { PageHeader } from '@/components/layout/PageHeader'
import { ListCard } from '@/components/order-to-cash/layout'
import { SalesOrderStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { listSalesOrders } from '@/lib/api/sales-orders'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'
import type { SalesOrder } from '@/types/order-to-cash'

const orderTotal = (so: SalesOrder) => so.lines.reduce((sum, l) => sum + l.amountCents, 0)
const orderBilled = (so: SalesOrder) => so.lines.reduce((sum, l) => sum + l.amountBilledCents, 0)

const columns: ColumnDef<SalesOrder>[] = [
  {
    id: 'order',
    accessorFn: (so) => `${so.orderNumber} ${so.customer.companyName} ${so.memo ?? ''}`,
    header: 'Order',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium text-ink">{row.original.orderNumber}</div>
        <div className="truncate text-xs text-ink-subtle">{row.original.customer.companyName}</div>
      </div>
    ),
  },
  { accessorKey: 'orderDate', header: 'Order date', cell: ({ row }) => formatDate(row.original.orderDate) },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <SalesOrderStatusBadge status={row.original.status} />,
  },
  { accessorKey: 'terms', header: 'Terms' },
  {
    id: 'total',
    accessorFn: orderTotal,
    header: 'Order total',
    cell: ({ getValue }) => formatCents(getValue<number>()),
  },
  { id: 'billed', accessorFn: orderBilled, header: 'Billed', cell: ({ getValue }) => formatCents(getValue<number>()) },
  {
    id: 'unbilled',
    accessorFn: (so) => orderTotal(so) - orderBilled(so),
    header: 'Unbilled',
    cell: ({ getValue }) => formatCents(getValue<number>()),
  },
]

export function SalesOrders() {
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(listSalesOrders, [])
  const orders = useMemo(() => data ?? [], [data])

  const stats = useMemo(() => {
    const open = orders.filter((o) => !['billed', 'cancelled', 'closed'].includes(o.status))
    return {
      awaitingApproval: orders.filter((o) => o.status === 'pending_approval').length,
      open: open.length,
      unbilled: open.reduce((sum, o) => sum + orderTotal(o) - orderBilled(o), 0),
    }
  }, [orders])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Sales Orders"
        description="Commitments to bill: approve, fulfill, and invoice on schedule."
        actions={
          <Button size="sm" onClick={() => navigate('/sales-orders/new')}>
            <Plus className="h-4 w-4" />
            New Sales Order
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Open Orders" value={stats.open.toString()} icon={ClipboardList} />
        <StatCard
          label="Awaiting Approval"
          value={stats.awaitingApproval.toString()}
          icon={Clock}
          tone={stats.awaitingApproval ? 'danger' : 'default'}
        />
        <StatCard label="Unbilled on Open Orders" value={formatCents(stats.unbilled)} icon={Receipt} tone="success" />
      </div>
      <ListCard loading={loading} error={error}>
        <DataTable
          columns={columns}
          data={orders}
          searchPlaceholder="Search by order number or customer..."
          onRowClick={(so) => navigate(`/sales-orders/${so.id}`)}
        />
      </ListCard>
    </div>
  )
}

import type { ColumnDef } from '@tanstack/react-table'
import { CalendarClock, FileSignature, Plus, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/data-table/DataTable'
import { PageHeader } from '@/components/layout/PageHeader'
import { ListCard } from '@/components/order-to-cash/layout'
import { ContractStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { annualValue, listContracts } from '@/lib/api/contracts'
import { addDays, dateOnly, todayIso } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'
import type { Contract } from '@/types/order-to-cash'

const columns: ColumnDef<Contract>[] = [
  {
    id: 'contract',
    accessorFn: (c) => `${c.contractNumber} ${c.customer.companyName}`,
    header: 'Contract',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium text-ink">{row.original.contractNumber}</div>
        <div className="truncate text-xs text-ink-subtle">{row.original.customer.companyName}</div>
      </div>
    ),
  },
  {
    id: 'term',
    accessorFn: (c) => c.startDate,
    header: 'Term',
    cell: ({ row }) => `${formatDate(row.original.startDate)} – ${formatDate(row.original.endDate)}`,
  },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <ContractStatusBadge status={row.original.status} /> },
  {
    id: 'acv',
    accessorFn: annualValue,
    header: 'Annual value',
    cell: ({ getValue }) => formatCents(getValue<number>()),
  },
  {
    id: 'renewal',
    accessorFn: (c) => c.autoRenew,
    header: 'Renewal',
    cell: ({ row }) =>
      row.original.autoRenew
        ? `Auto · ${row.original.renewalTermMonths} mo${row.original.upliftPercent ? ` · +${row.original.upliftPercent}%` : ''}`
        : 'Manual',
  },
]

export function Contracts() {
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(listContracts, [])
  const contracts = useMemo(() => data ?? [], [data])

  const stats = useMemo(() => {
    const active = contracts.filter((c) => c.status === 'active')
    const horizon = addDays(dateOnly(todayIso()), 90)
    return {
      active: active.length,
      acv: active.reduce((sum, c) => sum + annualValue(c), 0),
      renewingSoon: active.filter((c) => dateOnly(c.endDate) <= horizon).length,
    }
  }, [contracts])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Contracts"
        description="Term contracts that bill on schedule and renew automatically."
        actions={
          <Button size="sm" onClick={() => navigate('/contracts/new')}>
            <Plus className="h-4 w-4" />
            New Contract
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Active Contracts" value={stats.active.toString()} icon={FileSignature} />
        <StatCard label="Active Annual Value" value={formatCents(stats.acv)} icon={RefreshCw} tone="success" />
        <StatCard label="Ending in 90 Days" value={stats.renewingSoon.toString()} icon={CalendarClock} />
      </div>
      <ListCard loading={loading} error={error}>
        <DataTable
          columns={columns}
          data={contracts}
          searchPlaceholder="Search contracts..."
          onRowClick={(c) => navigate(`/contracts/${c.id}`)}
        />
      </ListCard>
    </div>
  )
}

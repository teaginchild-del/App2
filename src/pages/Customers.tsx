import { AlertCircle, Plus, TrendingUp, UserCheck, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { customerColumns } from '@/components/customers/columns'
import { CustomerDetail } from '@/components/customers/CustomerDetail'
import { DataTable } from '@/components/data-table/DataTable'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { customers } from '@/data/customers'
import { formatCurrency } from '@/lib/format'
import type { Customer } from '@/types/customer'

export function Customers() {
  const navigate = useNavigate()
  const { customerId } = useParams()

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customerId],
  )

  const stats = useMemo(() => {
    const active = customers.filter((c) => c.status === 'active')
    const pastDue = customers.filter((c) => c.status === 'past_due')
    const totalMrr = active.reduce((sum, c) => sum + c.mrr, 0)
    const totalPastDue = pastDue.reduce((sum, c) => sum + c.balanceDue, 0)
    return {
      total: customers.length,
      active: active.length,
      totalMrr,
      pastDueCount: pastDue.length,
      totalPastDue,
    }
  }, [])

  const handleRowClick = (customer: Customer) => {
    navigate(`/customers/${customer.id}`)
  }

  const handleClose = () => {
    navigate('/customers')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Customers"
        description="All customer accounts across billing, sales, and support."
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Customer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-4">
        <StatCard label="Total Customers" value={stats.total.toString()} icon={Users} />
        <StatCard label="Active Accounts" value={stats.active.toString()} icon={UserCheck} tone="success" />
        <StatCard label="Active MRR" value={formatCurrency(stats.totalMrr)} icon={TrendingUp} />
        <StatCard
          label={`Past Due (${stats.pastDueCount})`}
          value={formatCurrency(stats.totalPastDue)}
          icon={AlertCircle}
          tone="danger"
        />
      </div>

      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <DataTable
            columns={customerColumns}
            data={customers}
            searchPlaceholder="Search customers by name, contact, or email..."
            onRowClick={handleRowClick}
          />
        </div>
      </div>

      <CustomerDetail customer={selectedCustomer} onClose={handleClose} />
    </div>
  )
}

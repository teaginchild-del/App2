import { AlertCircle, ArrowRight, TrendingUp, Users } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatusBadge } from '@/components/customers/StatusBadge'
import { StatCard } from '@/components/ui/stat-card'
import { customers } from '@/data/customers'
import { formatCurrency, initials } from '@/lib/format'

export function Home() {
  const stats = useMemo(() => {
    const active = customers.filter((c) => c.status === 'active')
    const pastDue = customers.filter((c) => c.status === 'past_due')
    const totalMrr = active.reduce((sum, c) => sum + c.mrr, 0)
    return { total: customers.length, totalMrr, pastDueCount: pastDue.length }
  }, [])

  const recentCustomers = useMemo(
    () =>
      [...customers]
        .sort((a, b) => (a.customerSince < b.customerSince ? 1 : -1))
        .slice(0, 6),
    [],
  )

  const attentionNeeded = useMemo(
    () => customers.filter((c) => c.status === 'past_due').slice(0, 5),
    [],
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Home" description="Welcome back — here's what's happening across your accounts." />

      <div className="space-y-8 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Customers" value={stats.total.toString()} icon={Users} />
          <StatCard label="Active MRR" value={formatCurrency(stats.totalMrr)} icon={TrendingUp} />
          <StatCard
            label="Accounts Past Due"
            value={stats.pastDueCount.toString()}
            icon={AlertCircle}
            tone="danger"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel
            title="Recently Added Customers"
            action={
              <Link
                to="/customers"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <ul className="divide-y divide-slate-100">
              {recentCustomers.map((customer) => (
                <li key={customer.id}>
                  <Link
                    to={`/customers/${customer.id}`}
                    className="flex items-center gap-3 px-1 py-2.5 hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {initials(customer.companyName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">
                        {customer.companyName}
                      </div>
                      <div className="truncate text-xs text-ink-subtle">{customer.plan}</div>
                    </div>
                    <StatusBadge status={customer.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Needs Attention">
            {attentionNeeded.length === 0 ? (
              <p className="px-1 py-6 text-sm text-ink-muted">No past-due accounts right now.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attentionNeeded.map((customer) => (
                  <li key={customer.id}>
                    <Link
                      to={`/customers/${customer.id}`}
                      className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">
                          {customer.companyName}
                        </div>
                        <div className="truncate text-xs text-ink-subtle">
                          {customer.contactName}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-danger-600">
                        {formatCurrency(customer.balanceDue, customer.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

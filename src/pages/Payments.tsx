import { Banknote, PiggyBank, Plus, Undo2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordDepositDialog, RecordPaymentDialog, RefundDepositDialog } from '@/components/order-to-cash/CashDialogs'
import { ListCard, SimpleTable, Td } from '@/components/order-to-cash/layout'
import { DepositStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { listDeposits, listPayments } from '@/lib/api/cash'
import { listO2cCustomers } from '@/lib/api/o2c-shared'
import { listSalesOrders } from '@/lib/api/sales-orders'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'
import { cn } from '@/lib/utils'
import type { CustomerDeposit } from '@/types/order-to-cash'

type Tab = 'payments' | 'deposits'

export function Payments() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([listPayments(), listDeposits(), listO2cCustomers(), listSalesOrders()]),
    [],
  )
  const [tab, setTab] = useState<Tab>('payments')
  const [dialog, setDialog] = useState<'payment' | 'deposit' | null>(null)
  const [refunding, setRefunding] = useState<CustomerDeposit | null>(null)
  const [payments, deposits, customers, salesOrders] = data ?? [[], [], [], []]

  const stats = useMemo(
    () => ({
      received: payments.reduce((sum, p) => sum + p.amountCents, 0),
      unapplied: payments.reduce((sum, p) => sum + p.unappliedCents, 0),
      depositsHeld: deposits.reduce((sum, d) => sum + d.remainingCents, 0),
    }),
    [payments, deposits],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Payments"
        description="Cash received against invoices, and deposits taken before invoicing."
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setDialog('deposit')}>
              <PiggyBank className="h-4 w-4" />
              Record deposit
            </Button>
            <Button size="sm" onClick={() => setDialog('payment')}>
              <Plus className="h-4 w-4" />
              Receive payment
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Payments Received" value={formatCents(stats.received)} icon={Wallet} tone="success" />
        <StatCard label="Unapplied Credit" value={formatCents(stats.unapplied)} icon={Banknote} />
        <StatCard label="Deposits Held (liability)" value={formatCents(stats.depositsHeld)} icon={PiggyBank} />
      </div>

      <div className="flex gap-1 px-6 pb-3">
        {(['payments', 'deposits'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium capitalize',
              tab === t ? 'bg-brand-50 text-brand-600' : 'text-ink-muted hover:bg-slate-100',
            )}
          >
            {t === 'payments' ? 'Customer payments' : 'Customer deposits'}
          </button>
        ))}
      </div>

      <ListCard loading={loading && !data} error={error}>
        <div className="h-full overflow-auto">
          {tab === 'payments' ? (
            <SimpleTable
              head={['Received', 'Customer', 'Method', 'Reference', 'Amount', 'Applied to', 'Unapplied']}
              empty={payments.length === 0 && 'No payments yet.'}
            >
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer hover:bg-brand-50/40"
                  onClick={() => navigate(`/payments/${p.id}`)}
                >
                  <Td>{formatDate(p.receivedOn)}</Td>
                  <Td className="font-medium">{p.customer?.companyName}</Td>
                  <Td>{p.method.toUpperCase()}</Td>
                  <Td>{p.reference ?? '—'}</Td>
                  <Td>{formatCents(p.amountCents)}</Td>
                  <Td>
                    {p.applications.length === 0
                      ? '—'
                      : p.applications.map((a, i) => (
                          <span key={a.invoiceId}>
                            {i > 0 && ', '}
                            <Link
                              className="text-brand-600 hover:underline"
                              to={`/invoices/${a.invoiceId}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {a.invoiceNumber}
                            </Link>{' '}
                            ({formatCents(a.amountCents)})
                          </span>
                        ))}
                  </Td>
                  <Td>{p.unappliedCents ? formatCents(p.unappliedCents) : '—'}</Td>
                </tr>
              ))}
            </SimpleTable>
          ) : (
            <SimpleTable
              head={['Received', 'Customer', 'Sales order', 'Method', 'Amount', 'Applied', 'Refunded', 'Status', '']}
              empty={deposits.length === 0 && 'No deposits yet.'}
            >
              {deposits.map((d) => (
                <tr
                  key={d.id}
                  className="cursor-pointer hover:bg-brand-50/40"
                  onClick={() => navigate(`/payments/deposits/${d.id}`)}
                >
                  <Td>{formatDate(d.receivedOn)}</Td>
                  <Td className="font-medium">{d.customer?.companyName}</Td>
                  <Td>
                    {d.salesOrderId ? (
                      <Link
                        className="text-brand-600 hover:underline"
                        to={`/sales-orders/${d.salesOrderId}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {salesOrders.find((so) => so.id === d.salesOrderId)?.orderNumber ?? 'View'}
                      </Link>
                    ) : (
                      'Customer-level'
                    )}
                  </Td>
                  <Td>{d.method.toUpperCase()}</Td>
                  <Td>{formatCents(d.amountCents)}</Td>
                  <Td>{formatCents(d.amountAppliedCents)}</Td>
                  <Td>{formatCents(d.amountRefundedCents)}</Td>
                  <Td>
                    <DepositStatusBadge status={d.status} />
                  </Td>
                  <Td className="text-right">
                    {d.remainingCents > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRefunding(d)
                        }}
                      >
                        <Undo2 className="h-4 w-4" />
                        Refund
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </SimpleTable>
          )}
        </div>
      </ListCard>

      {dialog === 'payment' && (
        <RecordPaymentDialog open onClose={() => setDialog(null)} onRecorded={reload} customers={customers} />
      )}
      {dialog === 'deposit' && (
        <RecordDepositDialog
          open
          onClose={() => setDialog(null)}
          onRecorded={reload}
          customers={customers}
          salesOrders={salesOrders}
        />
      )}
      <RefundDepositDialog deposit={refunding} onClose={() => setRefunding(null)} onDone={reload} />
    </div>
  )
}

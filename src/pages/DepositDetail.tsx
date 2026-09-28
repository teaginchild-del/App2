import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { RefundDepositDialog } from '@/components/order-to-cash/CashDialogs'
import { BackTitle, KeyValue, PageState, Section } from '@/components/order-to-cash/layout'
import { RelatedRecordsCard } from '@/components/order-to-cash/RelatedRecordsCard'
import { DepositStatusBadge } from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { getDeposit } from '@/lib/api/cash'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'

export function DepositDetail() {
  const { depositId = '' } = useParams()
  const { data: deposit, loading, error, reload } = useAsync(() => getDeposit(depositId), [depositId])
  const [refunding, setRefunding] = useState(false)

  if (!deposit) return <PageState loading={loading} error={error} backTo="/payments" backLabel="Payments" />

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/payments" label="Payments">
            <span className="flex items-center gap-3">
              Deposit · {deposit.method.toUpperCase()}
              {deposit.reference ? ` ${deposit.reference}` : ''}
              <DepositStatusBadge status={deposit.status} />
            </span>
          </BackTitle>
        }
        description={`${deposit.customer?.companyName ?? ''} · received ${formatDate(deposit.receivedOn)}`}
        actions={
          deposit.remainingCents > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setRefunding(true)}>
              <Undo2 className="h-4 w-4" />
              Refund
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Summary">
            <KeyValue label="Customer" value={deposit.customer?.companyName ?? '—'} />
            <KeyValue label="Scope" value={deposit.salesOrderId ? 'Sales order deposit' : 'Customer-level deposit'} />
            <KeyValue label="Method" value={deposit.method.toUpperCase()} />
            <KeyValue label="Reference" value={deposit.reference ?? '—'} />
            <div className="my-2 border-t border-slate-100" />
            <KeyValue label="Amount received" value={formatCents(deposit.amountCents)} tone="strong" />
            <KeyValue label="Applied to invoices" value={formatCents(deposit.amountAppliedCents)} />
            <KeyValue label="Refunded" value={formatCents(deposit.amountRefundedCents)} />
            <KeyValue label="Unused (liability)" value={formatCents(deposit.remainingCents)} />
            <KeyValue label="Bank deposit" value={deposit.bankDepositId ? 'Deposited' : 'In undeposited funds'} />
          </Section>
        </div>
        <div className="space-y-6">
          <RelatedRecordsCard type="customer_deposit" id={deposit.id} refreshKey={deposit} />
        </div>
      </div>
      {refunding && <RefundDepositDialog deposit={deposit} onClose={() => setRefunding(false)} onDone={reload} />}
    </div>
  )
}

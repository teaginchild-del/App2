import { Badge } from '@/components/ui/badge'
import type { CustomerDepositStatus, SalesOrderStatus } from '@/lib/billing-engine'
import type { InvoiceStatus } from '@/types/billing'
import type { BillingEventStatus, ContractStatus, StatementLineStatus } from '@/types/order-to-cash'

type Variant = 'success' | 'neutral' | 'warning' | 'danger' | 'info'

function StatusBadge<T extends string>({ status, config }: { status: T; config: Record<T, [string, Variant]> }) {
  const [label, variant] = config[status]
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  )
}

const salesOrder: Record<SalesOrderStatus, [string, Variant]> = {
  pending_approval: ['Pending Approval', 'warning'],
  pending_fulfillment: ['Pending Fulfillment', 'info'],
  pending_billing: ['Pending Billing', 'info'],
  partially_billed: ['Partially Billed', 'info'],
  billed: ['Billed', 'success'],
  cancelled: ['Cancelled', 'neutral'],
  closed: ['Closed', 'neutral'],
}

const invoice: Record<InvoiceStatus, [string, Variant]> = {
  draft: ['Draft', 'neutral'],
  open: ['Open', 'info'],
  partially_paid: ['Partially Paid', 'warning'],
  paid: ['Paid', 'success'],
  void: ['Void', 'neutral'],
}

const deposit: Record<CustomerDepositStatus, [string, Variant]> = {
  unapplied: ['Unapplied', 'info'],
  partially_applied: ['Partially Applied', 'warning'],
  fully_applied: ['Fully Applied', 'success'],
  refunded: ['Refunded', 'neutral'],
}

const contract: Record<ContractStatus, [string, Variant]> = {
  draft: ['Draft', 'warning'],
  active: ['Active', 'success'],
  renewed: ['Renewed', 'info'],
  terminated: ['Terminated', 'neutral'],
  expired: ['Expired', 'neutral'],
}

const event: Record<BillingEventStatus, [string, Variant]> = {
  pending: ['Pending', 'info'],
  billed: ['Billed', 'success'],
  cancelled: ['Cancelled', 'neutral'],
}

const statementLine: Record<StatementLineStatus, [string, Variant]> = {
  unmatched: ['Unmatched', 'warning'],
  matched: ['Matched', 'success'],
  ignored: ['Ignored', 'neutral'],
}

export const SalesOrderStatusBadge = ({ status }: { status: SalesOrderStatus }) => (
  <StatusBadge status={status} config={salesOrder} />
)
export const InvoiceStatusBadge = ({ status }: { status: InvoiceStatus }) => (
  <StatusBadge status={status} config={invoice} />
)
export const DepositStatusBadge = ({ status }: { status: CustomerDepositStatus }) => (
  <StatusBadge status={status} config={deposit} />
)
export const ContractStatusBadge = ({ status }: { status: ContractStatus }) => (
  <StatusBadge status={status} config={contract} />
)
export const BillingEventStatusBadge = ({ status }: { status: BillingEventStatus }) => (
  <StatusBadge status={status} config={event} />
)
export const StatementLineStatusBadge = ({ status }: { status: StatementLineStatus }) => (
  <StatusBadge status={status} config={statementLine} />
)

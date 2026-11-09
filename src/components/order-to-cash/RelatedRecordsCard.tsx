import {
  ArrowDownRight,
  ArrowUpLeft,
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  HandCoins,
  Landmark,
  PackageCheck,
  PiggyBank,
  Scale,
  Undo2,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Section } from '@/components/order-to-cash/layout'
import {
  ContractStatusBadge,
  DepositStatusBadge,
  InvoiceStatusBadge,
  SalesOrderStatusBadge,
  StatementLineStatusBadge,
} from '@/components/order-to-cash/StatusBadges'
import { SubscriptionStatusBadge } from '@/components/subscriptions/StatusBadge'
import { Badge } from '@/components/ui/badge'
import type { CustomerDepositStatus, SalesOrderStatus } from '@/lib/billing-engine'
import {
  getRelatedRecords,
  type RelatedKind,
  type RelatedObjectType,
  type RelatedRecord,
} from '@/lib/api/related-records'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'
import type { InvoiceStatus, SubscriptionStatus } from '@/types/billing'
import type { ContractStatus, StatementLineStatus } from '@/types/order-to-cash'

const ICONS: Record<RelatedKind, LucideIcon> = {
  customer: Building2,
  contract: FileSignature,
  sales_order: ClipboardList,
  subscription: CreditCard,
  invoice: FileText,
  customer_deposit: PiggyBank,
  customer_payment: HandCoins,
  bank_deposit: Landmark,
  statement_line: Scale,
  fulfillment: PackageCheck,
  dunning_notice: BellRing,
  refund: Undo2,
  credit: Wallet,
}

function StatusFor({ record }: { record: RelatedRecord }) {
  const status = record.status
  if (!status) return null
  switch (record.kind) {
    case 'contract':
      return <ContractStatusBadge status={status as ContractStatus} />
    case 'sales_order':
      return <SalesOrderStatusBadge status={status as SalesOrderStatus} />
    case 'invoice':
      return <InvoiceStatusBadge status={status as InvoiceStatus} />
    case 'customer_deposit':
      return <DepositStatusBadge status={status as CustomerDepositStatus} />
    case 'statement_line':
      return <StatementLineStatusBadge status={status as StatementLineStatus} />
    case 'subscription':
      return <SubscriptionStatusBadge status={status as SubscriptionStatus} />
    default:
      return <Badge variant="neutral">{status}</Badge>
  }
}

function RecordRow({ record }: { record: RelatedRecord }) {
  const Icon = ICONS[record.kind]
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {record.href ? (
            <Link to={record.href} className="truncate text-sm font-medium text-brand-600 hover:underline">
              {record.label}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-ink">{record.label}</span>
          )}
          {record.amountCents != null && (
            <span className="shrink-0 text-sm tabular-nums text-ink">{formatCents(record.amountCents)}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-ink-subtle">
            {record.relation}
            {record.date ? ` · ${formatDate(record.date)}` : ''}
          </span>
          <StatusFor record={record} />
        </div>
      </div>
    </li>
  )
}

function Direction({
  title,
  hint,
  icon: Icon,
  records,
  empty,
}: {
  title: string
  hint: string
  icon: LucideIcon
  records: RelatedRecord[]
  empty: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="font-normal normal-case tracking-normal text-ink-subtle">· {hint}</span>
      </div>
      {records.length === 0 ? (
        <p className="py-2.5 text-sm text-ink-subtle">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {records.map((r) => (
            <RecordRow key={`${r.kind}:${r.id}:${r.relation}`} record={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Related records for any billing object, split into upstream (where it came
 * from) and downstream (what it has affected). Pass `refreshKey` a value
 * that changes when the page reloads so the card refreshes after actions.
 */
export function RelatedRecordsCard({
  type,
  id,
  refreshKey,
}: {
  type: RelatedObjectType
  id: string
  refreshKey?: unknown
}) {
  const { data, loading, error } = useAsync(() => getRelatedRecords(type, id), [type, id, refreshKey])

  return (
    <Section title="Related records">
      {error ? (
        <p className="text-sm text-danger-600">{error}</p>
      ) : loading && !data ? (
        <p className="text-sm text-ink-muted">Loading...</p>
      ) : (
        <div className="space-y-4">
          <Direction
            title="Upstream"
            hint="origin"
            icon={ArrowUpLeft}
            records={data?.upstream ?? []}
            empty="Nothing upstream — this record started the chain."
          />
          <div className="border-t border-slate-100" />
          <Direction
            title="Downstream"
            hint="impact"
            icon={ArrowDownRight}
            records={data?.downstream ?? []}
            empty="Nothing downstream yet."
          />
        </div>
      )}
    </Section>
  )
}

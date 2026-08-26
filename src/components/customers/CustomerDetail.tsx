import {
  Building2,
  CalendarClock,
  CreditCard,
  Globe,
  Mail,
  MapPin,
  Phone,
  Receipt,
  User,
} from 'lucide-react'
import { LifecycleBadge, StatusBadge } from '@/components/customers/StatusBadge'
import { Sheet, SheetHeader } from '@/components/ui/sheet'
import { formatCurrency, formatDate, initials } from '@/lib/format'
import type { Customer, PaymentMethod } from '@/types/customer'

const paymentMethodLabels: Record<PaymentMethod, string> = {
  credit_card: 'Credit Card',
  ach: 'ACH / Bank Transfer',
  invoice: 'Invoice',
  wire: 'Wire Transfer',
}

export function CustomerDetail({
  customer,
  onClose,
}: {
  customer: Customer | null
  onClose: () => void
}) {
  return (
    <Sheet open={!!customer} onClose={onClose}>
      {customer && (
        <div className="flex h-full flex-col overflow-y-auto">
          <SheetHeader
            title={
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {initials(customer.companyName)}
                </div>
                <span>{customer.companyName}</span>
              </div>
            }
            subtitle={customer.customerNumber}
            onClose={onClose}
          />

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-4">
            <StatusBadge status={customer.status} />
            <LifecycleBadge stage={customer.lifecycleStage} />
            {customer.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-ink-muted"
              >
                {tag}
              </span>
            ))}
          </div>

          <Section title="Overview">
            <InfoRow icon={Building2} label="Industry" value={customer.industry} />
            <InfoRow icon={Globe} label="Website" value={customer.website} />
            <InfoRow icon={User} label="Account Owner" value={customer.owner} />
            <InfoRow
              icon={CalendarClock}
              label="Customer Since"
              value={formatDate(customer.customerSince)}
            />
          </Section>

          <Section title="Primary Contact">
            <InfoRow icon={User} label={customer.contactTitle} value={customer.contactName} />
            <InfoRow icon={Mail} label="Email" value={customer.email} />
            <InfoRow icon={Phone} label="Phone" value={customer.phone} />
            <InfoRow
              icon={MapPin}
              label="Address"
              value={`${customer.address.line1}, ${customer.address.city}, ${customer.address.state} ${customer.address.postalCode}`}
            />
          </Section>

          <Section title="Billing & Subscription">
            <div className="grid grid-cols-2 gap-4">
              <Metric label="MRR" value={formatCurrency(customer.mrr, customer.currency)} />
              <Metric
                label="Lifetime Value"
                value={formatCurrency(customer.lifetimeValue, customer.currency)}
              />
              <Metric
                label="Balance Due"
                value={formatCurrency(customer.balanceDue, customer.currency)}
                highlight={customer.balanceDue > 0}
              />
              <Metric
                label="Billing Cycle"
                value={customer.billingCycle === 'monthly' ? 'Monthly' : 'Annual'}
              />
            </div>
            <div className="mt-4 space-y-1">
              <InfoRow icon={Receipt} label="Plan" value={customer.plan} />
              <InfoRow
                icon={CreditCard}
                label="Payment Method"
                value={paymentMethodLabels[customer.paymentMethod]}
              />
              <InfoRow
                icon={CalendarClock}
                label="Last Invoice"
                value={formatDate(customer.lastInvoiceDate)}
              />
              <InfoRow
                icon={CalendarClock}
                label="Next Billing Date"
                value={formatDate(customer.nextBillingDate)}
              />
            </div>
          </Section>
        </div>
      )}
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 px-6 py-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
      <div className="min-w-0">
        <div className="text-xs text-ink-subtle">{label}</div>
        <div className="truncate text-ink">{value}</div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-ink-subtle">{label}</div>
      <div className={highlight ? 'text-lg font-semibold text-danger-600' : 'text-lg font-semibold text-ink'}>
        {value}
      </div>
    </div>
  )
}

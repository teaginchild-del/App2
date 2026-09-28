import { Ban, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  BackTitle,
  ErrorBanner,
  Field,
  KeyValue,
  PageState,
  Section,
  SimpleTable,
  Td,
} from '@/components/order-to-cash/layout'
import { RelatedRecordsCard } from '@/components/order-to-cash/RelatedRecordsCard'
import {
  BillingEventStatusBadge,
  ContractStatusBadge,
  SalesOrderStatusBadge,
} from '@/components/order-to-cash/StatusBadges'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { activateContract, annualValue, getContract, getContractLinks, terminateContract } from '@/lib/api/contracts'
import { getSalesOrder } from '@/lib/api/sales-orders'
import { addDays, dateOnly, extend, isoDate, todayIso } from '@/lib/billing-engine'
import { formatCents, formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

const FREQUENCY = { 1: 'Monthly', 3: 'Quarterly', 6: 'Semi-annually', 12: 'Annually' } as const

export function ContractDetail() {
  const { contractId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [contract, links] = await Promise.all([getContract(contractId), getContractLinks(contractId)])
    const order = links.salesOrderId ? await getSalesOrder(links.salesOrderId) : null
    return { contract, links, order }
  }, [contractId])
  const action = useAction()
  const [terminating, setTerminating] = useState(false)
  const [effective, setEffective] = useState(todayIso())

  if (!data) return <PageState loading={loading} error={error} backTo="/contracts" backLabel="Contracts" />
  const { contract, links, order } = data
  const events = order?.lines.flatMap((l) => l.billingEvents.map((e) => ({ ...e, description: l.description }))) ?? []
  const renewalOpens = isoDate(addDays(dateOnly(contract.endDate), -contract.renewalLeadDays))

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/contracts" label="Contracts">
            <span className="flex items-center gap-3">
              {contract.contractNumber}
              <ContractStatusBadge status={contract.status} />
            </span>
          </BackTitle>
        }
        description={`${contract.customer.companyName} · ${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`}
        actions={
          <>
            {contract.status === 'draft' && (
              <Button
                size="sm"
                disabled={action.pending}
                onClick={async () => {
                  if (await action.run(() => activateContract(contract))) await reload()
                }}
              >
                <PlayCircle className="h-4 w-4" />
                Activate
              </Button>
            )}
            {(contract.status === 'active' || contract.status === 'draft') && (
              <Button size="sm" variant="ghost" onClick={() => setTerminating(true)}>
                <Ban className="h-4 w-4" />
                Terminate
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ErrorBanner message={action.error} />
          <Section title="Items" flush>
            <SimpleTable head={['Item', 'Qty', 'Price / unit / period', 'Per period', 'Billing', 'Revenue']}>
              {contract.items.map((i) => (
                <tr key={i.id}>
                  <Td className="font-medium">{i.description}</Td>
                  <Td>{i.quantity}</Td>
                  <Td>{formatCents(i.unitPriceCents)}</Td>
                  <Td>{formatCents(extend(i.quantity, i.unitPriceCents))}</Td>
                  <Td>
                    {FREQUENCY[i.frequencyMonths]} in {i.timing}
                  </Td>
                  <Td>{i.revenueTreatment === 'ratable' ? 'Ratable' : 'When invoiced'}</Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>

          <Section
            title="Billing schedule"
            flush
            actions={
              order && (
                <Link
                  to={`/sales-orders/${order.id}`}
                  className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
                >
                  {order.orderNumber} <SalesOrderStatusBadge status={order.status} />
                </Link>
              )
            }
          >
            <SimpleTable
              head={['Item', 'Period', 'Bill date', 'Amount', 'Status']}
              empty={events.length === 0 && 'Activate the contract to generate its billing schedule.'}
            >
              {events.map((e) => (
                <tr key={e.id}>
                  <Td className="text-ink-muted">{e.description}</Td>
                  <Td>
                    {e.periodStart && e.periodEnd ? `${formatDate(e.periodStart)} – ${formatDate(e.periodEnd)}` : '—'}
                  </Td>
                  <Td>{e.billDate ? formatDate(e.billDate) : '—'}</Td>
                  <Td>{formatCents(e.amountCents)}</Td>
                  <Td>
                    <BillingEventStatusBadge status={e.status} />
                  </Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Summary">
            <KeyValue label="Customer" value={contract.customer.companyName} />
            <KeyValue label="Terms" value={contract.terms} />
            <KeyValue label="Annual value" value={formatCents(annualValue(contract))} tone="strong" />
            {contract.terminatedOn && <KeyValue label="Terminated" value={formatDate(contract.terminatedOn)} />}
          </Section>
          <Section title="Renewal">
            {contract.autoRenew ? (
              <>
                <KeyValue label="Renews for" value={`${contract.renewalTermMonths} months`} />
                <KeyValue label="Price uplift" value={`${contract.upliftPercent}%`} />
                <KeyValue label="Renewal generated on" value={formatDate(renewalOpens)} />
              </>
            ) : (
              <p className="text-sm text-ink-subtle">Does not auto-renew.</p>
            )}
            {contract.renewedFromId && (
              <KeyValue
                label="Renewal of"
                value={
                  <Link className="text-brand-600 hover:underline" to={`/contracts/${contract.renewedFromId}`}>
                    Previous term
                  </Link>
                }
              />
            )}
            {links.renewedToId && (
              <KeyValue
                label="Renewed by"
                value={
                  <Link className="text-brand-600 hover:underline" to={`/contracts/${links.renewedToId}`}>
                    Next term
                  </Link>
                }
              />
            )}
            {contract.status === 'draft' && contract.renewedFromId && (
              <p className="mt-2 text-xs text-ink-subtle">
                Approve the renewal order (or activate here) to start the new term.
              </p>
            )}
          </Section>
          <RelatedRecordsCard type="contract" id={contract.id} refreshKey={data} />
        </div>
      </div>

      <Dialog
        open={terminating}
        onClose={() => setTerminating(false)}
        title="Terminate contract"
        subtitle="Billing for periods starting after this date is cancelled"
      >
        <div className="space-y-4">
          <Field label="Effective date" hint="Credit for an already-billed period isn't issued automatically.">
            <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </Field>
          <ErrorBanner message={action.error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTerminating(false)}>
              Cancel
            </Button>
            <Button
              disabled={action.pending}
              onClick={async () => {
                if (await action.run(() => terminateContract(contract.id, effective))) {
                  setTerminating(false)
                  await reload()
                }
              }}
            >
              Terminate
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

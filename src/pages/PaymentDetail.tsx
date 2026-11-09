import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BackTitle, KeyValue, PageState, Section, SimpleTable, Td } from '@/components/order-to-cash/layout'
import { RelatedRecordsCard } from '@/components/order-to-cash/RelatedRecordsCard'
import { getPayment } from '@/lib/api/cash'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'

export function PaymentDetail() {
  const { paymentId = '' } = useParams()
  const { data: payment, loading, error } = useAsync(() => getPayment(paymentId), [paymentId])

  if (!payment) return <PageState loading={loading} error={error} backTo="/payments" backLabel="Payments" />
  const applied = payment.amountCents - payment.unappliedCents

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/payments" label="Payments">
            Payment · {payment.method.toUpperCase()}
            {payment.reference ? ` ${payment.reference}` : ''}
          </BackTitle>
        }
        description={`${payment.customer?.companyName ?? ''} · received ${formatDate(payment.receivedOn)}`}
      />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Applied to invoices" flush>
            <SimpleTable
              head={['Invoice', 'Amount applied']}
              empty={payment.applications.length === 0 && 'Not applied to any invoice — held as unapplied credit.'}
            >
              {payment.applications.map((a) => (
                <tr key={a.invoiceId}>
                  <Td>
                    <Link className="font-medium text-brand-600 hover:underline" to={`/invoices/${a.invoiceId}`}>
                      {a.invoiceNumber}
                    </Link>
                  </Td>
                  <Td>{formatCents(a.amountCents)}</Td>
                </tr>
              ))}
            </SimpleTable>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Summary">
            <KeyValue label="Customer" value={payment.customer?.companyName ?? '—'} />
            <KeyValue label="Method" value={payment.method.toUpperCase()} />
            <KeyValue label="Reference" value={payment.reference ?? '—'} />
            {payment.stripePayoutId && <KeyValue label="Stripe payout" value={payment.stripePayoutId} />}
            <div className="my-2 border-t border-slate-100" />
            <KeyValue label="Amount" value={formatCents(payment.amountCents)} tone="strong" />
            <KeyValue label="Applied" value={formatCents(applied)} />
            <KeyValue label="Unapplied credit" value={formatCents(payment.unappliedCents)} />
            <KeyValue label="Bank deposit" value={payment.bankDepositId ? 'Deposited' : 'In undeposited funds'} />
          </Section>
          <RelatedRecordsCard type="customer_payment" id={payment.id} refreshKey={payment} />
        </div>
      </div>
    </div>
  )
}

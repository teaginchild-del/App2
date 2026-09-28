import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { BackTitle, KeyValue, PageState, Section } from '@/components/order-to-cash/layout'
import { RelatedRecordsCard } from '@/components/order-to-cash/RelatedRecordsCard'
import { getBankDeposit } from '@/lib/api/banking'
import { formatCents, formatDate } from '@/lib/format'
import { useAsync } from '@/lib/use-async'

const SOURCE_LABELS = { stripe_payout: 'Stripe payout', check_batch: 'Check batch', individual: 'Individual' } as const

export function BankDepositDetail() {
  const { bankDepositId = '' } = useParams()
  const { data: deposit, loading, error } = useAsync(() => getBankDeposit(bankDepositId), [bankDepositId])

  if (!deposit) return <PageState loading={loading} error={error} backTo="/banking" backLabel="Banking" />

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title={
          <BackTitle to="/banking" label="Banking">
            Bank deposit · {formatDate(deposit.depositDate)}
          </BackTitle>
        }
        description={`${SOURCE_LABELS[deposit.source]} · ${formatCents(deposit.amountCents)}`}
      />
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Summary">
            <KeyValue label="Deposit date" value={formatDate(deposit.depositDate)} />
            <KeyValue label="Source" value={SOURCE_LABELS[deposit.source]} />
            <KeyValue label="Reference" value={deposit.reference ?? '—'} />
            {deposit.stripePayoutId && <KeyValue label="Stripe payout" value={deposit.stripePayoutId} />}
            <KeyValue label="Amount" value={formatCents(deposit.amountCents)} tone="strong" />
            <KeyValue
              label="Reconciled"
              value={deposit.matched ? 'Matched to bank statement' : 'Not yet on a statement'}
              tone={deposit.matched ? 'success' : undefined}
            />
          </Section>
        </div>
        <div className="space-y-6">
          <RelatedRecordsCard type="bank_deposit" id={deposit.id} refreshKey={deposit} />
        </div>
      </div>
    </div>
  )
}

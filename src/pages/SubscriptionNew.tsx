import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { StepIndicator } from '@/components/subscriptions/wizard/StepIndicator'
import { Step1Customer } from '@/components/subscriptions/wizard/Step1Customer'
import { Step2Configure } from '@/components/subscriptions/wizard/Step2Configure'
import { Step3Term } from '@/components/subscriptions/wizard/Step3Term'
import { createInitialWizardState, resolveFirstBillingDate, type WizardState } from '@/components/subscriptions/wizard/types'
import { createSubscription } from '@/lib/api/billing'

export function SubscriptionNew() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(createInitialWizardState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }))

  const stepValid = (() => {
    if (step === 1) return state.customer !== null
    if (step === 2) {
      if (!state.product) return false
      if (state.isCustomPrice) return (state.customPriceCents ?? 0) > 0
      return true
    }
    if (step === 3) {
      if (!state.termStartDate) return false
      if (state.termType === 'term' && !state.termEndDate) return false
      if (state.termType === 'term' && state.termEndDate < state.termStartDate) return false
      if (!resolveFirstBillingDate(state)) return false
      if (!state.orderDate) return false
      return true
    }
    return false
  })()

  const handleSubmit = async () => {
    if (!state.customer || !state.product) return
    setSubmitting(true)
    setError(null)
    try {
      const subscription = await createSubscription({
        customerId: state.customer.id,
        productId: state.product.id,
        product: state.product,
        productPricePointId: state.isCustomPrice ? null : state.productPricePointId,
        productPricePoint: state.isCustomPrice
          ? null
          : (state.pricePoints.find((p) => p.id === state.productPricePointId) ?? null),
        isCustomPrice: state.isCustomPrice,
        customPriceCents: state.customPriceCents,
        components: state.selectedComponents,
        coupon: state.coupon,
        termType: state.termType,
        termStartDate: state.termStartDate,
        termEndDate: state.termType === 'term' ? state.termEndDate : null,
        firstBillingDate: resolveFirstBillingDate(state),
        orderDate: state.orderDate,
      })
      navigate(`/subscriptions/${subscription.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subscription.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="New Subscription"
        description="Attach a customer, configure pricing, and set the term."
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/subscriptions')}>
            Cancel
          </Button>
        }
      />

      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <StepIndicator current={step} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {step === 1 && <Step1Customer customer={state.customer} onSelect={(customer) => update({ customer })} />}
          {step === 2 && <Step2Configure state={state} update={update} />}
          {step === 3 && <Step3Term state={state} update={update} />}

          {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}

          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {step < 3 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!stepValid}>
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={!stepValid || submitting}>
                {submitting ? 'Creating Subscription...' : 'Create Subscription'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

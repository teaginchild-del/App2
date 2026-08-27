import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { resolveFirstBillingDate, type WizardState } from '@/components/subscriptions/wizard/types'

interface Step3Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

export function Step3Term({ state, update }: Step3Props) {
  const firstBillingDate = resolveFirstBillingDate(state)

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <label className="mb-2 block text-xs font-medium text-ink-muted">Term</label>
        <div className="grid grid-cols-2 gap-3">
          <TermOption
            label="Term"
            description="Fixed start and end date"
            selected={state.termType === 'term'}
            onClick={() => update({ termType: 'term' })}
          />
          <TermOption
            label="Evergreen"
            description="Renews continuously, no end date"
            selected={state.termType === 'evergreen'}
            onClick={() => update({ termType: 'evergreen', termEndDate: '' })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Start Date *</label>
          <Input
            type="date"
            value={state.termStartDate}
            onChange={(e) => update({ termStartDate: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            End Date {state.termType === 'term' && '*'}
          </label>
          <Input
            type="date"
            value={state.termEndDate}
            onChange={(e) => update({ termEndDate: e.target.value })}
            disabled={state.termType === 'evergreen'}
            min={state.termStartDate || undefined}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">First Billing Date</label>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            className="w-48"
            value={state.firstBillingOption}
            onChange={(e) => update({ firstBillingOption: e.target.value as WizardState['firstBillingOption'] })}
          >
            <option value="immediately">Immediately</option>
            <option value="on_start">On Start Date</option>
            <option value="custom">Custom Date</option>
          </Select>
          {state.firstBillingOption === 'custom' ? (
            <Input
              type="date"
              value={state.firstBillingCustomDate}
              onChange={(e) => update({ firstBillingCustomDate: e.target.value })}
            />
          ) : (
            <span className="text-sm text-ink-muted">Resolves to {firstBillingDate || '—'}</span>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">Order Date</label>
        <Input type="date" value={state.orderDate} onChange={(e) => update({ orderDate: e.target.value })} />
        <p className="mt-1 text-xs text-ink-subtle">
          When the deal was actually signed. Defaults to today, but can be backdated independent of the term or
          billing dates (e.g. to account for onboarding lag).
        </p>
      </div>
    </div>
  )
}

function TermOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-4 py-3 text-left transition-colors',
        selected ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-brand-600' : 'border-slate-300',
          )}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
        </span>
        <span className="text-sm font-medium text-ink">{label}</span>
      </div>
      <p className="mt-1 text-xs text-ink-subtle">{description}</p>
    </button>
  )
}

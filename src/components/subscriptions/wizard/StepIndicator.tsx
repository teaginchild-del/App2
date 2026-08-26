import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const steps = [
  { step: 1, label: 'Add Customer' },
  { step: 2, label: 'Configure' },
  { step: 3, label: 'Term Setting' },
]

export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.step} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                current > s.step
                  ? 'bg-brand-600 text-white'
                  : current === s.step
                    ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-500'
                    : 'bg-slate-100 text-ink-subtle',
              )}
            >
              {current > s.step ? <Check className="h-3.5 w-3.5" /> : s.step}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                current === s.step ? 'text-ink' : 'text-ink-subtle',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && <div className="mx-2 h-px w-8 bg-slate-200" />}
        </li>
      ))}
    </ol>
  )
}

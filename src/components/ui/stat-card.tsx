import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  icon: LucideIcon
  tone?: 'default' | 'danger' | 'success'
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          tone === 'danger' && 'bg-danger-50 text-danger-600',
          tone === 'success' && 'bg-success-50 text-success-600',
          tone === 'default' && 'bg-brand-50 text-brand-600',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-subtle">{label}</div>
        <div className="truncate text-xl font-semibold text-ink">{value}</div>
      </div>
    </div>
  )
}

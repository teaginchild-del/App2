import { AlertCircle, ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Section({
  title,
  actions,
  children,
  className,
  flush,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** No inner padding — for full-bleed tables. */
  flush?: boolean
}) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h3>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>}
    </label>
  )
}

export function KeyValue({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'strong' | 'success' | 'danger'
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="truncate text-ink-muted">{label}</span>
      <span
        className={cn(
          'shrink-0 text-ink',
          tone === 'strong' && 'font-semibold',
          tone === 'success' && 'font-medium text-success-700',
          tone === 'danger' && 'font-medium text-danger-700',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function NoticeBanner({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-blue-200 bg-info-50 px-3 py-2 text-sm text-info-700">{children}</div>
}

export function BackTitle({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => navigate(to)}
        className="rounded-md p-1 text-ink-subtle hover:bg-slate-100 hover:text-ink"
        aria-label={`Back to ${label}`}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      {children}
    </span>
  )
}

/** Full-page loading / error placeholder for detail screens. */
export function PageState({
  loading,
  error,
  backTo,
  backLabel,
}: {
  loading: boolean
  error: string | null
  backTo: string
  backLabel: string
}) {
  const navigate = useNavigate()
  if (loading) return <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading...</div>
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-danger-600">
      {error ?? 'Not found.'}
      <Button variant="secondary" size="sm" onClick={() => navigate(backTo)}>
        Back to {backLabel}
      </Button>
    </div>
  )
}

/** Simple table for detail sections (DataTable is for full-page lists). */
/** `empty` is shown under the header when there are no rows, e.g. `empty={rows.length === 0 && 'None yet.'}`. */
export function SimpleTable({
  head,
  children,
  empty,
}: {
  head: ReactNode[]
  children: ReactNode
  empty?: string | false
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-slate-200 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <EmptyRowNote text={empty} />}
    </div>
  )
}

function EmptyRowNote({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-sm text-ink-subtle">{text}</div>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b border-slate-100 px-4 py-2.5 align-middle text-ink', className)}>{children}</td>
}

/** Scrollable full-height page body used by list screens. */
export function ListCard({
  loading,
  error,
  children,
}: {
  loading: boolean
  error: string | null
  children: ReactNode
}) {
  return (
    <div className="min-h-0 flex-1 px-6 pb-6">
      <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-danger-600">
            {error}
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading...</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

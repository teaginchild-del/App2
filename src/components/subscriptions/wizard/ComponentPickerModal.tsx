import { Check, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/format'
import { listComponents } from '@/lib/api/billing'
import type { Component } from '@/types/billing'
import type { SelectedComponent } from '@/components/subscriptions/wizard/types'

export function ComponentPickerModal({
  open,
  onClose,
  productId,
  selected,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  productId: string | null
  selected: SelectedComponent[]
  onAdd: (component: Component) => void
}) {
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listComponents(productId ?? undefined)
      .then(setComponents)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load components.'))
      .finally(() => setLoading(false))
  }, [open, productId])

  const selectedIds = new Set(selected.map((s) => s.component.id))

  return (
    <Dialog open={open} onClose={onClose} title="Add Component" subtitle="Attach add-ons from your catalog to this subscription.">
      {error && <p className="mb-3 text-sm text-danger-600">{error}</p>}
      {loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">Loading components...</p>
      ) : components.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No components available in the catalog.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {components.map((c) => {
            const isAdded = selectedIds.has(c.id)
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                  <div className="truncate text-xs text-ink-subtle">
                    {formatCurrency(c.priceCents / 100)}
                    {c.pricingScheme === 'per_unit' && c.unitName ? ` / ${c.unitName}` : ''}
                    {c.pricingScheme === 'flat' ? ' flat' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => onAdd(c)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50 disabled:cursor-default disabled:border-success-600 disabled:bg-success-50 disabled:text-success-700"
                >
                  {isAdded ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Added
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}

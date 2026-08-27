import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createProductFamily } from '@/lib/api/catalog'
import type { ProductFamily } from '@/types/billing'

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function ProductFamilyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (family: ProductFamily) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [apiHandle, setApiHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setApiHandle('')
    setHandleTouched(false)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!name.trim() || !apiHandle.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const family = await createProductFamily({
        name: name.trim(),
        description: description.trim() || undefined,
        apiHandle: apiHandle.trim(),
      })
      onCreated(family)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product family.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="New Product Family" subtitle="Groups related products together.">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Name</label>
          <Input
            value={name}
            onChange={(e) => {
              const value = e.target.value
              setName(value)
              if (!handleTouched) setApiHandle(slugify(value))
            }}
            placeholder="e.g. Core Platform"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            placeholder="What this product family is for..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink">API Handle</label>
          <Input
            value={apiHandle}
            onChange={(e) => {
              setHandleTouched(true)
              setApiHandle(slugify(e.target.value))
            }}
            placeholder="core-platform"
          />
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!name.trim() || !apiHandle.trim() || submitting}>
            {submitting ? 'Creating...' : 'Create Family'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

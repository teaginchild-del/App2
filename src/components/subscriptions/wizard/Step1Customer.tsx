import { Building2, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createCustomer, listCustomers } from '@/lib/api/billing'
import { cn } from '@/lib/utils'
import type { BillingCustomer } from '@/types/billing'

export function Step1Customer({
  customer,
  onSelect,
}: {
  customer: BillingCustomer | null
  onSelect: (customer: BillingCustomer) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<BillingCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timeout = setTimeout(() => {
      listCustomers(search)
        .then((data) => {
          if (!cancelled) setResults(data)
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load customers.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [search])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Which customer is this subscription for?</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Search for an existing customer, or create a new one if they aren't in the system yet.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, contact, or email..."
            className="pl-9"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create New Customer
        </Button>
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-ink-muted">Loading customers...</div>
        ) : results.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-muted">No customers found.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/40',
                    customer?.id === c.id && 'bg-brand-50/60',
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{c.companyName}</div>
                    <div className="truncate text-xs text-ink-subtle">
                      {[c.contactName, c.email].filter(Boolean).join(' · ') || 'No contact on file'}
                    </div>
                  </div>
                  {customer?.id === c.id && (
                    <span className="shrink-0 text-xs font-medium text-brand-600">Selected</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {customer && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm text-ink">
          <span className="font-medium">{customer.companyName}</span> is selected for this subscription.
        </div>
      )}

      <CreateCustomerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(c) => {
          setCreateOpen(false)
          onSelect(c)
        }}
      />
    </div>
  )
}

function CreateCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (customer: BillingCustomer) => void
}) {
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [industry, setIndustry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!companyName.trim()) {
      setError('Company name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createCustomer({ companyName, contactName, email, industry })
      setCompanyName('')
      setContactName('')
      setEmail('')
      setIndustry('')
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create New Customer" subtitle="Add a customer record to attach this subscription to.">
      <div className="space-y-3">
        <Field label="Company Name" required>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Fintech" />
        </Field>
        <Field label="Primary Contact">
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jordan Bennett" />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jordan@acmefintech.com"
          />
        </Field>
        <Field label="Industry">
          <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Financial Services" />
        </Field>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
        {required && <span className="text-danger-600"> *</span>}
      </span>
      {children}
    </label>
  )
}

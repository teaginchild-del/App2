import type { InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { COMMON_TERMS, type ReceiptMethod } from '@/lib/billing-engine'
import { RECEIPT_METHODS } from '@/lib/api/cash'
import type { O2cCustomer } from '@/types/order-to-cash'

/** Dollar-denominated input for a cents value. Keeps the raw text while typing. */
export function MoneyInput({
  value,
  onChange,
  ...props
}: { value: string; onChange: (value: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">$</span>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-6"
        placeholder="0.00"
        {...props}
      />
    </div>
  )
}

export function CustomerSelect({
  customers,
  value,
  onChange,
  disabled,
}: {
  customers: O2cCustomer[]
  value: string
  onChange: (customerId: string) => void
  disabled?: boolean
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">Select a customer…</option>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.companyName}
        </option>
      ))}
    </Select>
  )
}

export function TermsSelect({ value, onChange }: { value: string; onChange: (terms: string) => void }) {
  const options = COMMON_TERMS.includes(value) ? COMMON_TERMS : [value, ...COMMON_TERMS]
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  )
}

export function MethodSelect({
  value,
  onChange,
  exclude = [],
}: {
  value: ReceiptMethod
  onChange: (method: ReceiptMethod) => void
  exclude?: ReceiptMethod[]
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ReceiptMethod)}>
      {RECEIPT_METHODS.filter((m) => !exclude.includes(m.value)).map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Select>
  )
}

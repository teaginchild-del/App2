import type {
  BillingFrequencyMonths,
  BillingScheduleSpec,
  BillingTiming,
  ItemKind,
  RevenueTreatment,
} from '@/lib/billing-engine'

/** Parses a MoneyInput string into cents; NaN when blank or invalid. */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (cleaned === '') return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export type ScheduleKind = 'none' | 'one_time' | 'installments' | 'milestones' | 'recurring'

/** Form state for one line; strings until submitted. */
export interface LineDraft {
  key: string
  productId: string
  description: string
  itemKind: ItemKind
  quantity: string
  unitPrice: string
  taxable: boolean
  taxRate: string
  revenueTreatment: RevenueTreatment
  revRecStart: string
  revRecEnd: string
  schedule: ScheduleKind
  oneTimeDate: string
  installmentCount: string
  installmentInterval: string
  installmentFirstDate: string
  milestones: Array<{ name: string; percent: string }>
  frequencyMonths: BillingFrequencyMonths
  timing: BillingTiming
  serviceStart: string
  serviceEnd: string
}

export function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    productId: '',
    description: '',
    itemKind: 'service',
    quantity: '1',
    unitPrice: '',
    taxable: false,
    taxRate: '0',
    revenueTreatment: 'point_in_time',
    revRecStart: '',
    revRecEnd: '',
    schedule: 'none',
    oneTimeDate: '',
    installmentCount: '3',
    installmentInterval: '1',
    installmentFirstDate: '',
    milestones: [
      { name: 'Kickoff', percent: '50' },
      { name: 'Completion', percent: '50' },
    ],
    frequencyMonths: 1,
    timing: 'advance',
    serviceStart: '',
    serviceEnd: '',
  }
}

/** The billing schedule a line's form describes (recurring bills qty × price per period). */
export function lineSchedule(line: LineDraft): BillingScheduleSpec | null {
  switch (line.schedule) {
    case 'none':
      return null
    case 'one_time':
      if (!line.oneTimeDate) throw new Error(`"${line.description || 'Line'}": pick the bill date`)
      return { type: 'one_time', billDate: line.oneTimeDate }
    case 'installments':
      if (!line.installmentFirstDate)
        throw new Error(`"${line.description || 'Line'}": pick the first installment date`)
      return {
        type: 'installments',
        count: Number(line.installmentCount),
        intervalMonths: Number(line.installmentInterval),
        firstBillDate: line.installmentFirstDate,
      }
    case 'milestones':
      return {
        type: 'milestones',
        milestones: line.milestones.map((m) => ({ name: m.name.trim() || 'Milestone', percent: Number(m.percent) })),
      }
    case 'recurring':
      if (!line.serviceStart || !line.serviceEnd) {
        throw new Error(`"${line.description || 'Line'}": recurring billing needs a service start and end date`)
      }
      return {
        type: 'recurring',
        frequencyMonths: line.frequencyMonths,
        timing: line.timing,
        serviceStart: line.serviceStart,
        serviceEnd: line.serviceEnd,
        amountPerPeriod: Math.round(Number(line.quantity) * parseMoney(line.unitPrice)),
      }
  }
}

export function lineNumbers(line: LineDraft, index: number) {
  const quantity = Number(line.quantity)
  const unitPriceCents = parseMoney(line.unitPrice)
  if (!(quantity > 0)) throw new Error(`Line ${index + 1}: quantity must be positive`)
  if (!Number.isFinite(unitPriceCents)) throw new Error(`Line ${index + 1}: enter a unit price`)
  const taxRatePercent = line.taxable ? Number(line.taxRate) : 0
  if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0) throw new Error(`Line ${index + 1}: tax rate is invalid`)
  return { quantity, unitPriceCents, taxRatePercent }
}

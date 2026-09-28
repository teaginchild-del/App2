import { applyDeposits, type AvailableDeposit, type DepositApplication } from './cash-application'
import { dateOnly } from './dates'
import { percentOf, sum, type Cents } from './money'
import { dueDateFor, type PaymentTerms } from './payment-terms'
import { isDeferred, ratableSchedule, type RevRecEntry, type RevenueTreatment } from './revenue-recognition'

/**
 * Builds an invoice from billable sales-order lines / billing events. The
 * invoice is the posting transaction: Dr Accounts Receivable, Cr Revenue
 * (or Deferred Revenue for ratable lines still being earned), Cr Sales Tax
 * Payable — and, when a customer deposit is applied, Dr Customer Deposits
 * (liability), Cr Accounts Receivable.
 */

export interface InvoiceLineInput {
  salesOrderLineId?: string
  billingEventId?: string
  productId?: string | null
  description: string
  quantity?: number
  unitPrice?: Cents
  amount: Cents
  taxable: boolean
  taxRatePercent: number
  revenueTreatment: RevenueTreatment
  revRecStart?: Date
  revRecEnd?: Date
}

export interface InvoiceLineDraft extends InvoiceLineInput {
  taxAmount: Cents
  deferred: boolean
  revRecSchedule: RevRecEntry[]
}

export type GlAccount =
  | 'accounts_receivable'
  | 'revenue'
  | 'deferred_revenue'
  | 'sales_tax_payable'
  | 'customer_deposits'

export interface GlLine {
  account: GlAccount
  debit: Cents
  credit: Cents
}

export interface InvoiceDraft {
  invoiceDate: Date
  dueDate: Date
  lines: InvoiceLineDraft[]
  subtotal: Cents
  taxTotal: Cents
  total: Cents
  depositApplications: DepositApplication[]
  depositApplied: Cents
  balanceDue: Cents
  gl: GlLine[]
}

export function buildInvoiceDraft(params: {
  invoiceDate: Date
  terms: PaymentTerms
  lines: InvoiceLineInput[]
  deposits?: AvailableDeposit[]
  salesOrderId?: string | null
  applyUnlinkedDeposits?: boolean
}): InvoiceDraft {
  if (params.lines.length === 0) throw new Error('Nothing to bill: invoice has no lines')
  const invoiceDate = dateOnly(params.invoiceDate)

  const lines: InvoiceLineDraft[] = params.lines.map((l) => {
    if (l.revenueTreatment === 'ratable' && (!l.revRecStart || !l.revRecEnd)) {
      throw new Error(`Line "${l.description}": ratable revenue needs a service period (start and end dates)`)
    }
    const deferred = isDeferred(l.revenueTreatment, invoiceDate, l.revRecEnd)
    return {
      ...l,
      taxAmount: l.taxable ? percentOf(l.amount, l.taxRatePercent) : 0,
      deferred,
      revRecSchedule: deferred ? ratableSchedule(l.amount, l.revRecStart!, l.revRecEnd!) : [],
    }
  })

  const subtotal = sum(lines.map((l) => l.amount))
  const taxTotal = sum(lines.map((l) => l.taxAmount))
  const total = subtotal + taxTotal

  const depositApplications =
    total > 0
      ? applyDeposits(total, params.deposits ?? [], params.salesOrderId ?? null, params.applyUnlinkedDeposits)
      : []
  const depositApplied = sum(depositApplications.map((d) => d.amount))

  const deferredAmount = sum(lines.filter((l) => l.deferred).map((l) => l.amount))
  const gl: GlLine[] = [
    { account: 'accounts_receivable', debit: total, credit: 0 },
    { account: 'revenue', debit: 0, credit: subtotal - deferredAmount },
    { account: 'deferred_revenue', debit: 0, credit: deferredAmount },
    { account: 'sales_tax_payable', debit: 0, credit: taxTotal },
  ]
  if (depositApplied > 0) {
    gl.push(
      { account: 'customer_deposits', debit: depositApplied, credit: 0 },
      { account: 'accounts_receivable', debit: 0, credit: depositApplied },
    )
  }

  return {
    invoiceDate,
    dueDate: dueDateFor(invoiceDate, params.terms),
    lines,
    subtotal,
    taxTotal,
    total,
    depositApplications,
    depositApplied,
    balanceDue: total - depositApplied,
    gl: gl.filter((g) => g.debit !== 0 || g.credit !== 0),
  }
}

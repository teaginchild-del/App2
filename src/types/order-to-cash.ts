import type {
  BankDepositSource,
  BillingFrequencyMonths,
  BillingScheduleSpec,
  BillingTiming,
  CustomerDepositStatus,
  ItemKind,
  MatchRule,
  ReceiptMethod,
  RevenueTreatment,
  SalesOrderStatus,
} from '@/lib/billing-engine'
import type { BillingCustomer } from '@/types/billing'

/** Customer fields the order-to-cash screens need (adds default terms). */
export interface O2cCustomer extends BillingCustomer {
  paymentTerms: string
}

export type BillingEventStatus = 'pending' | 'billed' | 'cancelled'

export interface BillingEvent {
  id: string
  salesOrderLineId: string
  seq: number
  /** null until a milestone is completed. */
  billDate: string | null
  amountCents: number
  periodStart: string | null
  periodEnd: string | null
  milestoneName: string | null
  milestoneCompletedAt: string | null
  status: BillingEventStatus
}

export interface SalesOrderLine {
  id: string
  lineNo: number
  productId: string | null
  description: string
  itemKind: ItemKind
  quantity: number
  unitPriceCents: number
  amountCents: number
  quantityFulfilled: number
  quantityBilled: number
  amountBilledCents: number
  taxable: boolean
  taxRatePercent: number
  revenueTreatment: RevenueTreatment
  revRecStart: string | null
  revRecEnd: string | null
  billingSchedule: BillingScheduleSpec | null
  contractItemId: string | null
  billingEvents: BillingEvent[]
}

export interface SalesOrder {
  id: string
  orderNumber: string
  customerId: string
  customer: O2cCustomer
  orderDate: string
  terms: string
  currency: string
  memo: string | null
  depositRequestedCents: number | null
  requiresApproval: boolean
  approvedAt: string | null
  approvedBy: string | null
  cancelledAt: string | null
  closedAt: string | null
  contractId: string | null
  createdAt: string
  lines: SalesOrderLine[]
  /** Derived from line progress — see deriveSalesOrderStatus. */
  status: SalesOrderStatus
}

export interface Fulfillment {
  id: string
  fulfilledOn: string
  reference: string | null
  lines: Array<{ salesOrderLineId: string; quantity: number }>
}

export interface CustomerDeposit {
  id: string
  customerId: string
  customer: O2cCustomer | null
  salesOrderId: string | null
  receivedOn: string
  amountCents: number
  amountAppliedCents: number
  amountRefundedCents: number
  method: ReceiptMethod
  reference: string | null
  stripePayoutId: string | null
  bankDepositId: string | null
  createdAt: string
  status: CustomerDepositStatus
  remainingCents: number
}

export interface CustomerPayment {
  id: string
  customerId: string
  customer: O2cCustomer | null
  receivedOn: string
  amountCents: number
  unappliedCents: number
  method: ReceiptMethod
  reference: string | null
  stripePayoutId: string | null
  bankDepositId: string | null
  createdAt: string
  applications: Array<{ invoiceId: string; invoiceNumber: string | null; amountCents: number }>
}

export interface BankDeposit {
  id: string
  depositDate: string
  amountCents: number
  source: BankDepositSource
  stripePayoutId: string | null
  reference: string | null
  createdAt: string
  matched: boolean
}

export type StatementLineStatus = 'unmatched' | 'matched' | 'ignored'

export interface BankStatementLine {
  id: string
  postedOn: string
  amountCents: number
  description: string
  externalId: string
  status: StatementLineStatus
  bankDepositId: string | null
  matchRule: MatchRule | null
  matchedAt: string | null
}

export interface RevRecEntry {
  id: string
  invoiceLineItemId: string
  recognizeOn: string
  amountCents: number
  recognizedAt: string | null
  invoiceId: string
  invoiceNumber: string
  customerName: string
  description: string
}

export interface DunningNotice {
  id: string
  invoiceId: string
  invoiceNumber: string
  customerName: string
  level: number
  subject: string
  sentTo: string | null
  deliveryStatus: 'queued' | 'sent'
  createdAt: string
  sentAt: string | null
  balanceCents: number
}

export type ContractStatus = 'draft' | 'active' | 'renewed' | 'terminated' | 'expired'

export interface ContractItem {
  id: string
  productId: string | null
  description: string
  quantity: number
  unitPriceCents: number
  frequencyMonths: BillingFrequencyMonths
  timing: BillingTiming
  startDate: string
  endDate: string
  revenueTreatment: RevenueTreatment
}

export interface Contract {
  id: string
  contractNumber: string
  customerId: string
  customer: O2cCustomer
  startDate: string
  endDate: string
  terms: string
  status: ContractStatus
  autoRenew: boolean
  renewalTermMonths: number
  upliftPercent: number
  renewalLeadDays: number
  renewedFromId: string | null
  terminatedOn: string | null
  createdAt: string
  items: ContractItem[]
}

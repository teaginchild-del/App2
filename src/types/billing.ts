export type BillingInterval = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'one_time' | 'daily'

export type CatalogIntervalUnit = 'month' | 'day'
export type TermIntervalUnit = 'month' | 'day' | 'year'

export type BillingCustomerStatus = 'active' | 'trial' | 'past_due' | 'canceled' | 'paused'

/**
 * Lightweight customer record used by the Subscription module (backed by
 * the real `customers` table). Distinct from the richer mock `Customer`
 * type used by the existing Customers page/table.
 */
export interface BillingCustomer {
  id: string
  companyName: string
  contactName: string | null
  email: string | null
  industry: string | null
  status: BillingCustomerStatus
}

export interface Product {
  id: string
  adminId: string | null
  name: string
  description: string | null
  basePriceCents: number
  billingInterval: BillingInterval
  accountingCode: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string

  // Catalog fields — populated by the Products management UI. Optional so
  // the lighter-weight Subscription-flow product records stay valid.
  productFamilyId?: string | null
  apiHandle?: string | null
  itemCategory?: string | null
  department?: string | null
  enableTaxes?: boolean
  requirePaymentMethod?: boolean
  requireBillingAddress?: boolean
  createV2SignupPage?: boolean
  enableUrlParams?: boolean
  priceInterval?: number
  priceIntervalUnit?: CatalogIntervalUnit
  taxIncluded?: boolean
  hasTrial?: boolean
  trialInterval?: number | null
  trialIntervalUnit?: CatalogIntervalUnit | null
  trialPriceCents?: number | null
  hasSetupFee?: boolean
  setupFeeCents?: number | null
  hasTerm?: boolean
  termInterval?: number | null
  termIntervalUnit?: TermIntervalUnit | null
}

export interface ProductFamily {
  id: string
  adminId: string | null
  name: string
  description: string | null
  apiHandle: string
  createdAt: string
  updatedAt: string
}

export interface ProductPricePoint {
  id: string
  productId: string
  name: string
  priceCents: number
  billingInterval: BillingInterval
  isDefault: boolean
}

export type PricingScheme = 'flat' | 'per_unit' | 'tiered'

export interface Component {
  id: string
  productId: string | null
  name: string
  pricingScheme: PricingScheme
  unitName: string | null
  priceCents: number
}

export type CouponDiscountType = 'percent' | 'fixed'
export type CouponDuration = 'once' | 'repeating' | 'forever'

export interface Coupon {
  id: string
  adminId: string | null
  name: string
  discountType: CouponDiscountType
  discountValue: number
  duration: CouponDuration
  durationInPeriods: number | null
  maxRedemptions: number | null
  redemptionCount: number
  expiresAt: string | null
  isActive: boolean
}

export type SubscriptionTermType = 'term' | 'evergreen'
export type SubscriptionStatus = 'active' | 'canceled' | 'expired'

export interface SubscriptionComponent {
  componentId: string
  quantity: number
  priceOverrideCents: number | null
  component?: Component
}

export interface SubscriptionCoupon {
  couponId: string
  appliedAt: string
  coupon?: Coupon
}

export interface Subscription {
  id: string
  adminId: string | null
  customerId: string
  productId: string
  productPricePointId: string | null
  customPriceCents: number | null
  isCustomPrice: boolean
  termType: SubscriptionTermType
  termStartDate: string
  termEndDate: string | null
  firstBillingDate: string
  orderDate: string
  status: SubscriptionStatus
  createdAt: string
  updatedAt: string
}

export interface SubscriptionWithRelations extends Subscription {
  customer: BillingCustomer
  product: Product
  productPricePoint: ProductPricePoint | null
  components: SubscriptionComponent[]
  coupons: SubscriptionCoupon[]
}

export type InvoiceStatus = 'draft' | 'open' | 'partially_paid' | 'paid' | 'void'

export interface InvoiceLineItem {
  id: string
  description: string
  amountCents: number
  quantity: number
  productId: string | null
  salesOrderLineId: string | null
  billingEventId: string | null
  unitPriceCents: number | null
  taxCents: number
  taxable: boolean
  revenueTreatment: 'point_in_time' | 'ratable'
  deferred: boolean
  revRecStart: string | null
  revRecEnd: string | null
}

export interface InvoiceGlLine {
  account: 'accounts_receivable' | 'revenue' | 'deferred_revenue' | 'sales_tax_payable' | 'customer_deposits'
  debit: number
  credit: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customer: (BillingCustomer & { paymentTerms: string }) | null
  subscriptionId: string | null
  salesOrderId: string | null
  status: InvoiceStatus
  terms: string | null
  memo: string | null
  subtotalCents: number
  taxTotalCents: number
  totalCents: number
  depositAppliedCents: number
  /** Total less deposits applied — what the customer was billed for. */
  amountDueCents: number
  /** Still owed after payments. */
  balanceCents: number
  currency: string
  issueDate: string
  dueDate: string | null
  glLines: InvoiceGlLine[]
  dunningLevel: number
  dunningPaused: boolean
  createdAt: string
  lineItems: InvoiceLineItem[]
}

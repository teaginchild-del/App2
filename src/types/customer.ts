export type CustomerStatus = 'active' | 'trial' | 'past_due' | 'canceled' | 'paused'

export type LifecycleStage = 'lead' | 'opportunity' | 'customer' | 'churned'

export type BillingCycle = 'monthly' | 'annual'

export type PaymentMethod = 'credit_card' | 'ach' | 'invoice' | 'wire'

export interface CustomerAddress {
  line1: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface Customer {
  id: string
  customerNumber: string
  companyName: string
  industry: string
  website: string
  contactName: string
  contactTitle: string
  email: string
  phone: string
  status: CustomerStatus
  lifecycleStage: LifecycleStage
  owner: string
  plan: string
  billingCycle: BillingCycle
  mrr: number
  balanceDue: number
  lifetimeValue: number
  currency: string
  paymentMethod: PaymentMethod
  lastInvoiceDate: string
  nextBillingDate: string
  customerSince: string
  address: CustomerAddress
  tags: string[]
}

import type { BillingCustomer, Component, Coupon, Product, ProductPricePoint } from '@/types/billing'

export type FirstBillingOption = 'immediately' | 'on_start' | 'custom'

export interface SelectedComponent {
  component: Component
  quantity: number
}

export interface WizardState {
  customer: BillingCustomer | null

  product: Product | null
  pricePoints: ProductPricePoint[]
  productPricePointId: string | null
  isCustomPrice: boolean
  customPriceCents: number | null
  selectedComponents: SelectedComponent[]
  coupon: Coupon | null

  termType: 'term' | 'evergreen'
  termStartDate: string
  termEndDate: string
  firstBillingOption: FirstBillingOption
  firstBillingCustomDate: string
  orderDate: string
}

const today = new Date().toISOString().slice(0, 10)

export function createInitialWizardState(): WizardState {
  return {
    customer: null,
    product: null,
    pricePoints: [],
    productPricePointId: null,
    isCustomPrice: false,
    customPriceCents: null,
    selectedComponents: [],
    coupon: null,
    termType: 'term',
    termStartDate: today,
    termEndDate: '',
    firstBillingOption: 'on_start',
    firstBillingCustomDate: '',
    orderDate: today,
  }
}

export function resolveFirstBillingDate(state: WizardState): string {
  if (state.firstBillingOption === 'immediately') return today
  if (state.firstBillingOption === 'custom') return state.firstBillingCustomDate
  return state.termStartDate
}

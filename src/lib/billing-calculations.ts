import type { Component, Coupon, ProductPricePoint } from '@/types/billing'

export interface PricedComponent {
  component: Component
  quantity: number
  priceOverrideCents: number | null
}

export function basePriceCents(
  pricePoint: ProductPricePoint | null,
  isCustomPrice: boolean,
  customPriceCents: number | null,
  productBasePriceCents: number,
): number {
  if (isCustomPrice) return customPriceCents ?? 0
  if (pricePoint) return pricePoint.priceCents
  return productBasePriceCents
}

export function componentLineCents(item: PricedComponent): number {
  const unitPrice = item.priceOverrideCents ?? item.component.priceCents
  if (item.component.pricingScheme === 'flat') return unitPrice
  return unitPrice * item.quantity
}

export function componentsTotalCents(items: PricedComponent[]): number {
  return items.reduce((sum, item) => sum + componentLineCents(item), 0)
}

export function couponDiscountCents(coupon: Coupon | null, subtotalCents: number): number {
  if (!coupon) return 0
  if (coupon.discountType === 'percent') {
    return Math.round((subtotalCents * coupon.discountValue) / 100)
  }
  return Math.min(coupon.discountValue, subtotalCents)
}

export function isCouponRedeemable(coupon: Coupon, now = new Date()): { ok: boolean; reason?: string } {
  if (!coupon.isActive) return { ok: false, reason: 'This coupon is no longer active.' }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    return { ok: false, reason: 'This coupon expired on ' + new Date(coupon.expiresAt).toLocaleDateString() + '.' }
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, reason: 'This coupon has reached its maximum redemptions.' }
  }
  return { ok: true }
}

export interface PricingSummary {
  baseCents: number
  componentsCents: number
  subtotalCents: number
  discountCents: number
  effectiveRecurringCents: number
}

export function summarizePricing(
  base: number,
  components: PricedComponent[],
  coupon: Coupon | null,
): PricingSummary {
  const componentsCents = componentsTotalCents(components)
  const subtotalCents = base + componentsCents
  const discountCents = couponDiscountCents(coupon, subtotalCents)
  return {
    baseCents: base,
    componentsCents,
    subtotalCents,
    discountCents,
    effectiveRecurringCents: Math.max(0, subtotalCents - discountCents),
  }
}

import { supabase } from '@/lib/supabase'
import { componentLineCents, couponDiscountCents } from '@/lib/billing-calculations'
import type {
  BillingCustomer,
  Component,
  Coupon,
  Product,
  ProductPricePoint,
  Subscription,
  SubscriptionComponent,
  SubscriptionCoupon,
  SubscriptionWithRelations,
} from '@/types/billing'

function mapCustomer(row: Record<string, unknown>): BillingCustomer {
  return {
    id: row.id as string,
    companyName: row.company_name as string,
    contactName: (row.contact_name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    status: row.status as BillingCustomer['status'],
  }
}

export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    adminId: (row.admin_id as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    basePriceCents: row.base_price_cents as number,
    billingInterval: row.billing_interval as Product['billingInterval'],
    accountingCode: (row.accounting_code as string | null) ?? null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    productFamilyId: (row.product_family_id as string | null) ?? null,
    apiHandle: (row.api_handle as string | null) ?? null,
    itemCategory: (row.item_category as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    enableTaxes: (row.enable_taxes as boolean | null) ?? false,
    requirePaymentMethod: (row.require_payment_method as boolean | null) ?? false,
    requireBillingAddress: (row.require_billing_address as boolean | null) ?? false,
    createV2SignupPage: (row.create_v2_signup_page as boolean | null) ?? false,
    enableUrlParams: (row.enable_url_params as boolean | null) ?? false,
    priceInterval: (row.price_interval as number | null) ?? 1,
    priceIntervalUnit: (row.price_interval_unit as Product['priceIntervalUnit']) ?? 'month',
    taxIncluded: (row.tax_included as boolean | null) ?? false,
    hasTrial: (row.has_trial as boolean | null) ?? false,
    trialInterval: (row.trial_interval as number | null) ?? null,
    trialIntervalUnit: (row.trial_interval_unit as Product['trialIntervalUnit']) ?? null,
    trialPriceCents: (row.trial_price_cents as number | null) ?? null,
    hasSetupFee: (row.has_setup_fee as boolean | null) ?? false,
    setupFeeCents: (row.setup_fee_cents as number | null) ?? null,
    hasTerm: (row.has_term as boolean | null) ?? false,
    termInterval: (row.term_interval as number | null) ?? null,
    termIntervalUnit: (row.term_interval_unit as Product['termIntervalUnit']) ?? null,
  }
}

function mapPricePoint(row: Record<string, unknown>): ProductPricePoint {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    name: row.name as string,
    priceCents: row.price_cents as number,
    billingInterval: row.billing_interval as ProductPricePoint['billingInterval'],
    isDefault: row.is_default as boolean,
  }
}

function mapComponent(row: Record<string, unknown>): Component {
  return {
    id: row.id as string,
    productId: (row.product_id as string | null) ?? null,
    name: row.name as string,
    pricingScheme: row.pricing_scheme as Component['pricingScheme'],
    unitName: (row.unit_name as string | null) ?? null,
    priceCents: row.price_cents as number,
  }
}

function mapCoupon(row: Record<string, unknown>): Coupon {
  return {
    id: row.id as string,
    adminId: (row.admin_id as string | null) ?? null,
    name: row.name as string,
    discountType: row.discount_type as Coupon['discountType'],
    discountValue: row.discount_value as number,
    duration: row.duration as Coupon['duration'],
    durationInPeriods: (row.duration_in_periods as number | null) ?? null,
    maxRedemptions: (row.max_redemptions as number | null) ?? null,
    redemptionCount: row.redemption_count as number,
    expiresAt: (row.expires_at as string | null) ?? null,
    isActive: row.is_active as boolean,
  }
}

function mapSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    adminId: (row.admin_id as string | null) ?? null,
    customerId: row.customer_id as string,
    productId: row.product_id as string,
    productPricePointId: (row.product_price_point_id as string | null) ?? null,
    customPriceCents: (row.custom_price_cents as number | null) ?? null,
    isCustomPrice: row.is_custom_price as boolean,
    termType: row.term_type as Subscription['termType'],
    termStartDate: row.term_start_date as string,
    termEndDate: (row.term_end_date as string | null) ?? null,
    firstBillingDate: row.first_billing_date as string,
    orderDate: row.order_date as string,
    status: row.status as Subscription['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function listCustomers(search?: string): Promise<BillingCustomer[]> {
  let query = supabase
    .from('customers')
    .select('id, company_name, contact_name, email, industry, status')
    .order('company_name', { ascending: true })

  if (search && search.trim()) {
    query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapCustomer)
}

export interface CreateCustomerInput {
  companyName: string
  contactName?: string
  email?: string
  industry?: string
}

export async function createCustomer(input: CreateCustomerInput): Promise<BillingCustomer> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      company_name: input.companyName,
      contact_name: input.contactName || null,
      email: input.email || null,
      industry: input.industry || null,
    })
    .select('id, company_name, contact_name, email, industry, status')
    .single()

  if (error) throw error
  return mapCustomer(data)
}

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapProduct)
}

export async function listPricePoints(productId: string): Promise<ProductPricePoint[]> {
  const { data, error } = await supabase
    .from('product_price_points')
    .select('*')
    .eq('product_id', productId)
    .order('price_cents', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapPricePoint)
}

export async function listComponents(productId?: string): Promise<Component[]> {
  let query = supabase.from('components').select('*').order('name', { ascending: true })
  if (productId) query = query.or(`product_id.eq.${productId},product_id.is.null`)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapComponent)
}

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapCoupon)
}

export async function listSubscriptions(): Promise<SubscriptionWithRelations[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      `*,
      customer:customers(id, company_name, contact_name, email, industry, status),
      product:products(*),
      product_price_point:product_price_points(*),
      subscription_components(quantity, price_override_cents, component:components(*)),
      subscription_coupons(applied_at, coupon:coupons(*))`,
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapSubscriptionRow)
}

export async function getSubscription(id: string): Promise<SubscriptionWithRelations> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      `*,
      customer:customers(id, company_name, contact_name, email, industry, status),
      product:products(*),
      product_price_point:product_price_points(*),
      subscription_components(quantity, price_override_cents, component:components(*)),
      subscription_coupons(applied_at, coupon:coupons(*))`,
    )
    .eq('id', id)
    .single()

  if (error) throw error
  return mapSubscriptionRow(data)
}

function mapSubscriptionRow(row: Record<string, unknown>): SubscriptionWithRelations {
  const components: SubscriptionComponent[] = ((row.subscription_components as Record<string, unknown>[]) ?? []).map(
    (c) => ({
      componentId: (c.component as Record<string, unknown>).id as string,
      quantity: c.quantity as number,
      priceOverrideCents: (c.price_override_cents as number | null) ?? null,
      component: mapComponent(c.component as Record<string, unknown>),
    }),
  )

  const coupons: SubscriptionCoupon[] = ((row.subscription_coupons as Record<string, unknown>[]) ?? []).map((c) => ({
    couponId: (c.coupon as Record<string, unknown>).id as string,
    appliedAt: c.applied_at as string,
    coupon: mapCoupon(c.coupon as Record<string, unknown>),
  }))

  return {
    ...mapSubscription(row),
    customer: mapCustomer(row.customer as Record<string, unknown>),
    product: mapProduct(row.product as Record<string, unknown>),
    productPricePoint: row.product_price_point ? mapPricePoint(row.product_price_point as Record<string, unknown>) : null,
    components,
    coupons,
  }
}

export interface CreateSubscriptionInput {
  customerId: string
  productId: string
  product: Product
  productPricePointId: string | null
  productPricePoint: ProductPricePoint | null
  isCustomPrice: boolean
  customPriceCents: number | null
  components: { component: Component; quantity: number }[]
  coupon: Coupon | null
  termType: Subscription['termType']
  termStartDate: string
  termEndDate: string | null
  firstBillingDate: string
  orderDate: string
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionWithRelations> {
  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from('subscriptions')
    .insert({
      customer_id: input.customerId,
      product_id: input.productId,
      product_price_point_id: input.productPricePointId,
      custom_price_cents: input.isCustomPrice ? input.customPriceCents : null,
      is_custom_price: input.isCustomPrice,
      term_type: input.termType,
      term_start_date: input.termStartDate,
      term_end_date: input.termType === 'term' ? input.termEndDate : null,
      first_billing_date: input.firstBillingDate,
      order_date: input.orderDate,
      status: 'active',
    })
    .select('id')
    .single()

  if (subscriptionError) throw subscriptionError
  const subscriptionId = subscriptionRow.id as string

  if (input.components.length > 0) {
    const { error: componentsError } = await supabase.from('subscription_components').insert(
      input.components.map((c) => ({
        subscription_id: subscriptionId,
        component_id: c.component.id,
        quantity: c.quantity,
      })),
    )
    if (componentsError) throw componentsError
  }

  if (input.coupon) {
    const { error: couponError } = await supabase.from('subscription_coupons').insert({
      subscription_id: subscriptionId,
      coupon_id: input.coupon.id,
    })
    if (couponError) throw couponError

    await supabase
      .from('coupons')
      .update({ redemption_count: input.coupon.redemptionCount + 1 })
      .eq('id', input.coupon.id)
  }

  await createDraftInvoiceForSubscription(subscriptionId, input)

  return getSubscription(subscriptionId)
}

/**
 * Stand-in for the app's (not-yet-built) invoice creation logic: drafts a
 * single invoice for the subscription's first billing period using the
 * same pricing breakdown shown in the wizard summary.
 */
async function createDraftInvoiceForSubscription(
  subscriptionId: string,
  input: CreateSubscriptionInput,
): Promise<void> {
  const base = input.isCustomPrice
    ? (input.customPriceCents ?? 0)
    : (input.productPricePoint?.priceCents ?? input.product.basePriceCents)

  const lineItems: { description: string; amount_cents: number; quantity: number; sort_order: number }[] = [
    {
      description: input.isCustomPrice
        ? `${input.product.name} (custom price)`
        : `${input.product.name}${input.productPricePoint ? ` — ${input.productPricePoint.name}` : ''}`,
      amount_cents: base,
      quantity: 1,
      sort_order: 0,
    },
  ]

  input.components.forEach((c, i) => {
    lineItems.push({
      description: `${c.component.name}${c.component.pricingScheme === 'per_unit' ? ` × ${c.quantity}` : ''}`,
      amount_cents: componentLineCents({ component: c.component, quantity: c.quantity, priceOverrideCents: null }),
      quantity: c.quantity,
      sort_order: i + 1,
    })
  })

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount_cents, 0)
  const discount = couponDiscountCents(input.coupon, subtotal)

  if (discount > 0 && input.coupon) {
    lineItems.push({
      description: `Coupon: ${input.coupon.name}`,
      amount_cents: -discount,
      quantity: 1,
      sort_order: lineItems.length,
    })
  }

  const amountDue = Math.max(0, subtotal - discount)

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      customer_id: input.customerId,
      subscription_id: subscriptionId,
      status: 'draft',
      amount_due_cents: amountDue,
      issue_date: input.firstBillingDate,
      due_date: input.firstBillingDate,
    })
    .select('id')
    .single()

  if (invoiceError) throw invoiceError

  const { error: lineItemsError } = await supabase.from('invoice_line_items').insert(
    lineItems.map((item) => ({ ...item, invoice_id: invoice.id })),
  )
  if (lineItemsError) throw lineItemsError
}

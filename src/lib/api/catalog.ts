import { supabase } from '@/lib/supabase'
import { mapProduct } from '@/lib/api/billing'
import type { CatalogIntervalUnit, Product, ProductFamily, TermIntervalUnit } from '@/types/billing'

function mapProductFamily(row: Record<string, unknown>): ProductFamily {
  return {
    id: row.id as string,
    adminId: (row.admin_id as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    apiHandle: row.api_handle as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function listProductFamilies(): Promise<ProductFamily[]> {
  const { data, error } = await supabase
    .from('product_families')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapProductFamily)
}

export interface CreateProductFamilyInput {
  name: string
  description?: string
  apiHandle: string
}

export async function createProductFamily(input: CreateProductFamilyInput): Promise<ProductFamily> {
  const { data, error } = await supabase
    .from('product_families')
    .insert({
      name: input.name,
      description: input.description || null,
      api_handle: input.apiHandle,
    })
    .select('*')
    .single()

  if (error) throw error
  return mapProductFamily(data)
}

/** All catalog products (active and inactive), for the Products management page. */
export async function listCatalogProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapProduct)
}

export interface CreateProductInput {
  productFamilyId: string
  name: string
  apiHandle?: string
  accountingCode?: string
  itemCategory?: string
  department?: string
  description?: string
  enableTaxes: boolean
  requirePaymentMethod: boolean
  requireBillingAddress: boolean
  createV2SignupPage: boolean
  enableUrlParams: boolean

  basePriceCents: number
  priceInterval: number
  priceIntervalUnit: CatalogIntervalUnit
  taxIncluded: boolean

  hasTrial: boolean
  trialInterval: number | null
  trialIntervalUnit: CatalogIntervalUnit | null
  trialPriceCents: number | null

  hasSetupFee: boolean
  setupFeeCents: number | null

  hasTerm: boolean
  termInterval: number | null
  termIntervalUnit: TermIntervalUnit | null
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      product_family_id: input.productFamilyId,
      name: input.name,
      api_handle: input.apiHandle || null,
      accounting_code: input.accountingCode || null,
      item_category: input.itemCategory || null,
      department: input.department || null,
      description: input.description || null,
      enable_taxes: input.enableTaxes,
      require_payment_method: input.requirePaymentMethod,
      require_billing_address: input.requireBillingAddress,
      create_v2_signup_page: input.createV2SignupPage,
      enable_url_params: input.enableUrlParams,

      base_price_cents: input.basePriceCents,
      billing_interval: input.priceIntervalUnit === 'day' ? 'daily' : 'monthly',
      price_interval: input.priceInterval,
      price_interval_unit: input.priceIntervalUnit,
      tax_included: input.taxIncluded,

      has_trial: input.hasTrial,
      trial_interval: input.hasTrial ? input.trialInterval : null,
      trial_interval_unit: input.hasTrial ? input.trialIntervalUnit : null,
      trial_price_cents: input.hasTrial ? input.trialPriceCents : null,

      has_setup_fee: input.hasSetupFee,
      setup_fee_cents: input.hasSetupFee ? input.setupFeeCents : null,

      has_term: input.hasTerm,
      term_interval: input.hasTerm ? input.termInterval : null,
      term_interval_unit: input.hasTerm ? input.termIntervalUnit : null,

      is_active: true,
    })
    .select('*')
    .single()

  if (error) throw error
  return mapProduct(data)
}

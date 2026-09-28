import { supabase } from '@/lib/supabase'
import {
  buildRenewal,
  contractItemSchedule,
  dateOnly,
  extend,
  isoDate,
  renewalDue,
  validateContract,
  type BillingFrequencyMonths,
  type BillingTiming,
  type ContractTerms,
  type RevenueTreatment,
} from '@/lib/billing-engine'
import { CUSTOMER_COLUMNS, mapO2cCustomer, num, rpc, str, type Row } from '@/lib/api/o2c-shared'
import { buildSalesOrderPayload } from '@/lib/api/sales-orders'
import type { Contract, ContractItem } from '@/types/order-to-cash'

/**
 * Contracts: header (customer, term, renewal rules) + items. Each contract
 * owns one sales order with a line per item on a recurring billing schedule,
 * so contract invoices come out of the same scheduled billing run as
 * everything else. Inside the renewal window the billing run creates the
 * next contract + a renewal order awaiting approval.
 */

function mapItem(row: Row): ContractItem {
  return {
    id: row.id as string,
    productId: str(row.product_id),
    description: row.description as string,
    quantity: num(row.quantity),
    unitPriceCents: row.unit_price_cents as number,
    frequencyMonths: row.frequency_months as BillingFrequencyMonths,
    timing: row.timing as BillingTiming,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    revenueTreatment: row.revenue_treatment as RevenueTreatment,
  }
}

function mapContract(row: Row): Contract {
  return {
    id: row.id as string,
    contractNumber: row.contract_number as string,
    customerId: row.customer_id as string,
    customer: mapO2cCustomer(row.customer as Row),
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    terms: row.terms as string,
    status: row.status as Contract['status'],
    autoRenew: row.auto_renew as boolean,
    renewalTermMonths: row.renewal_term_months as number,
    upliftPercent: num(row.uplift_percent),
    renewalLeadDays: row.renewal_lead_days as number,
    renewedFromId: str(row.renewed_from_id),
    terminatedOn: str(row.terminated_on),
    createdAt: row.created_at as string,
    items: ((row.contract_items as Row[]) ?? []).map(mapItem),
  }
}

/** Annualized contract value: per-period price × periods per year. */
export function annualValue(c: Pick<Contract, 'items'>): number {
  return c.items.reduce((sum, i) => sum + extend(i.quantity, i.unitPriceCents) * (12 / i.frequencyMonths), 0)
}

const CONTRACT_SELECT = `*, customer:customers(${CUSTOMER_COLUMNS}), contract_items(*)`

export async function listContracts(): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapContract)
}

export async function getContract(id: string): Promise<Contract> {
  const { data, error } = await supabase.from('contracts').select(CONTRACT_SELECT).eq('id', id).single()
  if (error) throw error
  return mapContract(data)
}

/** The contract's billing sales order id, and the id of the contract that renewed it (if any). */
export async function getContractLinks(
  id: string,
): Promise<{ salesOrderId: string | null; renewedToId: string | null }> {
  const [order, renewal] = await Promise.all([
    supabase.from('sales_orders').select('id').eq('contract_id', id).maybeSingle(),
    supabase.from('contracts').select('id').eq('renewed_from_id', id).maybeSingle(),
  ])
  if (order.error) throw order.error
  if (renewal.error) throw renewal.error
  return { salesOrderId: str(order.data?.id), renewedToId: str(renewal.data?.id) }
}

export interface ContractItemInput {
  productId: string | null
  description: string
  quantity: number
  unitPriceCents: number
  frequencyMonths: BillingFrequencyMonths
  timing: BillingTiming
  startDate?: string
  endDate?: string
  revenueTreatment: RevenueTreatment
}

export interface ContractInput {
  customerId: string
  startDate: string
  endDate: string
  terms: string
  autoRenew: boolean
  renewalTermMonths: number
  upliftPercent: number
  renewalLeadDays: number
  items: ContractItemInput[]
}

function toTerms(
  c: Pick<
    Contract,
    'startDate' | 'endDate' | 'autoRenew' | 'renewalTermMonths' | 'upliftPercent' | 'renewalLeadDays' | 'items'
  >,
): ContractTerms {
  return {
    startDate: dateOnly(c.startDate),
    endDate: dateOnly(c.endDate),
    renewal: {
      autoRenew: c.autoRenew,
      renewalTermMonths: c.renewalTermMonths,
      upliftPercent: c.upliftPercent,
      renewalLeadDays: c.renewalLeadDays,
    },
    items: c.items.map((i) => ({
      productId: i.productId,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPriceCents,
      frequencyMonths: i.frequencyMonths,
      timing: i.timing,
      startDate: dateOnly(i.startDate),
      endDate: dateOnly(i.endDate),
    })),
  }
}

/** The billing sales order for a contract: one recurring-schedule line per item. */
function contractOrderPayload(
  contract: Pick<Contract, 'id' | 'customerId' | 'startDate' | 'terms'> & { items: ContractItem[] },
  terms: ContractTerms,
  requiresApproval: boolean,
) {
  return buildSalesOrderPayload({
    customerId: contract.customerId,
    orderDate: contract.startDate,
    terms: contract.terms,
    requiresApproval,
    contractId: contract.id,
    lines: contract.items.map((item, i) => ({
      productId: item.productId,
      description: item.description,
      itemKind: 'service',
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      taxable: false,
      taxRatePercent: 0,
      revenueTreatment: item.revenueTreatment,
      billingSchedule: contractItemSchedule(terms.items[i]),
      contractItemId: item.id,
    })),
  })
}

function contractPayload(contract: Omit<Contract, 'customer' | 'createdAt' | 'contractNumber' | 'terminatedOn'>) {
  return {
    id: contract.id,
    customerId: contract.customerId,
    startDate: contract.startDate,
    endDate: contract.endDate,
    terms: contract.terms,
    status: contract.status,
    autoRenew: contract.autoRenew,
    renewalTermMonths: contract.renewalTermMonths,
    upliftPercent: contract.upliftPercent,
    renewalLeadDays: contract.renewalLeadDays,
    renewedFromId: contract.renewedFromId,
    items: contract.items,
  }
}

/** Creates a contract; with `activate` its billing order is created and approved immediately. */
export async function createContract(input: ContractInput, opts: { activate: boolean }): Promise<string> {
  const items: ContractItem[] = input.items.map((i) => ({
    id: crypto.randomUUID(),
    productId: i.productId,
    description: i.description.trim(),
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    frequencyMonths: i.frequencyMonths,
    timing: i.timing,
    startDate: i.startDate || input.startDate,
    endDate: i.endDate || input.endDate,
    revenueTreatment: i.revenueTreatment,
  }))
  const contract = {
    ...input,
    id: crypto.randomUUID(),
    status: opts.activate ? ('active' as const) : ('draft' as const),
    renewedFromId: null,
    items,
  }
  items.forEach((item, i) => {
    if (!item.description) throw new Error(`Item ${i + 1}: description is required`)
  })
  const terms = toTerms(contract)
  validateContract(terms)

  // The database sets the order's memo from the generated contract number.
  const order = opts.activate ? contractOrderPayload(contract, terms, false) : null
  return rpc<string>('o2c_create_contract', { p_contract: contractPayload(contract), p_order: order })
}

/** draft → active: creates the billing order, which starts scheduled invoicing. */
export async function activateContract(contract: Contract): Promise<void> {
  if (contract.status !== 'draft') throw new Error(`Contract is ${contract.status}`)
  const { salesOrderId } = await getContractLinks(contract.id)
  if (!salesOrderId) {
    await rpc('o2c_create_sales_order', {
      p_order: {
        ...contractOrderPayload(contract, toTerms(contract), false),
        memo: `Contract ${contract.contractNumber}`,
      },
    })
  } else {
    await rpc('o2c_approve_sales_order', { p_order_id: salesOrderId, p_approved_by: 'admin' })
  }
  const { error } = await supabase
    .from('contracts')
    .update({ status: 'active' })
    .eq('id', contract.id)
    .eq('status', 'draft')
  if (error) throw error
}

/** Ends a contract early; billing for periods starting after `effectiveDate` is cancelled. */
export async function terminateContract(contractId: string, effectiveDate: string): Promise<void> {
  await rpc('o2c_terminate_contract', { p_contract_id: contractId, p_effective: effectiveDate })
}

export interface RenewalRunResult {
  renewed: string[]
  expired: number
  failed: Array<{ contractNumber: string; error: string }>
}

/**
 * Generates renewals for auto-renew contracts inside their lead window (new
 * draft contract + renewal order pending approval, prices uplifted), then
 * closes out contracts past their end date: renewed if the renewal was
 * approved, expired otherwise.
 */
export async function runContractRenewals(asOf: string): Promise<RenewalRunResult> {
  const today = dateOnly(asOf)
  const contracts = await listContracts()
  const renewedFrom = new Map(contracts.filter((c) => c.renewedFromId).map((c) => [c.renewedFromId!, c]))
  const result: RenewalRunResult = { renewed: [], expired: 0, failed: [] }

  for (const contract of contracts) {
    if (contract.status !== 'active' || !contract.autoRenew || renewedFrom.has(contract.id)) continue
    const terms = toTerms(contract)
    if (!renewalDue(terms, today)) continue
    try {
      const next = buildRenewal(terms)
      const items: ContractItem[] = next.items.map((i) => ({
        id: crypto.randomUUID(),
        productId: i.productId,
        description: i.description,
        quantity: i.quantity,
        unitPriceCents: i.unitPrice,
        frequencyMonths: i.frequencyMonths,
        timing: i.timing,
        startDate: isoDate(i.startDate),
        endDate: isoDate(i.endDate),
        revenueTreatment:
          contract.items.find((ci) => ci.productId === i.productId && ci.description === i.description)
            ?.revenueTreatment ?? 'ratable',
      }))
      const renewal = {
        id: crypto.randomUUID(),
        customerId: contract.customerId,
        startDate: isoDate(next.startDate),
        endDate: isoDate(next.endDate),
        terms: contract.terms,
        status: 'draft' as const,
        autoRenew: contract.autoRenew,
        renewalTermMonths: contract.renewalTermMonths,
        upliftPercent: contract.upliftPercent,
        renewalLeadDays: contract.renewalLeadDays,
        renewedFromId: contract.id,
        items,
      }
      // Renewal order waits for approval; approving it activates the new contract.
      const order = contractOrderPayload(renewal, next, true)
      await rpc('o2c_create_contract', { p_contract: contractPayload(renewal), p_order: order })
      result.renewed.push(contract.contractNumber)
    } catch (err) {
      result.failed.push({
        contractNumber: contract.contractNumber,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const refreshed = await listContracts()
  const activeRenewals = new Set(
    refreshed.filter((c) => c.renewedFromId && c.status === 'active').map((c) => c.renewedFromId!),
  )
  for (const contract of refreshed) {
    if (contract.status !== 'active' || dateOnly(contract.endDate) >= today) continue
    const status = activeRenewals.has(contract.id) ? 'renewed' : 'expired'
    const { error } = await supabase.from('contracts').update({ status }).eq('id', contract.id).eq('status', 'active')
    if (error) throw error
    if (status === 'expired') result.expired++
  }
  return result
}

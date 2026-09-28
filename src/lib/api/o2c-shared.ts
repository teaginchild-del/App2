import { supabase } from '@/lib/supabase'
import type { O2cCustomer } from '@/types/order-to-cash'

/** Columns selected wherever an order-to-cash record embeds its customer. */
export const CUSTOMER_COLUMNS = 'id, company_name, contact_name, email, industry, status, payment_terms'

export type Row = Record<string, unknown>

export function mapO2cCustomer(row: Row): O2cCustomer {
  return {
    id: row.id as string,
    companyName: row.company_name as string,
    contactName: (row.contact_name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    status: row.status as O2cCustomer['status'],
    paymentTerms: (row.payment_terms as string | null) ?? 'Net 30',
  }
}

export function num(value: unknown): number {
  return value == null ? 0 : Number(value)
}

export function str(value: unknown): string | null {
  return (value as string | null) ?? null
}

/** Calls an o2c_* database function; its raised exceptions surface as the error message. */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export async function listO2cCustomers(): Promise<O2cCustomer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .order('company_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapO2cCustomer)
}

/** A stable key for one user action, so a double-submit or retry can't record it twice. */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`
}

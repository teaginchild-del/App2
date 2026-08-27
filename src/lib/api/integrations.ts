import { supabase } from '@/lib/supabase'
import type { Integration, IntegrationProvider } from '@/types/integrations'

function mapIntegration(row: Record<string, unknown>): Integration {
  return {
    id: row.id as string,
    provider: row.provider as IntegrationProvider,
    displayName: row.display_name as string,
    status: row.status as Integration['status'],
    authMethod: (row.auth_method as Integration['authMethod']) ?? null,
    accountEmail: (row.account_email as string | null) ?? null,
    apiKey: (row.api_key as string | null) ?? null,
    apiSecret: (row.api_secret as string | null) ?? null,
    refreshToken: (row.refresh_token as string | null) ?? null,
    connectedAt: (row.connected_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }
}

export async function listIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase.from('integrations').select('*').order('display_name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapIntegration)
}

/** Connect via the provider's hosted login (OAuth-style). */
export async function connectIntegrationWithLogin(
  provider: IntegrationProvider,
  accountEmail: string,
): Promise<Integration> {
  const { data, error } = await supabase
    .from('integrations')
    .update({
      status: 'connected',
      auth_method: 'oauth',
      account_email: accountEmail,
      connected_at: new Date().toISOString(),
    })
    .eq('provider', provider)
    .select('*')
    .single()

  if (error) throw error
  return mapIntegration(data)
}

export interface DeveloperCredentialsInput {
  apiKey: string
  apiSecret?: string
  refreshToken?: string
}

/** Connect via manually-entered developer credentials (API key/secret, refresh token). */
export async function connectIntegrationWithCredentials(
  provider: IntegrationProvider,
  input: DeveloperCredentialsInput,
): Promise<Integration> {
  const { data, error } = await supabase
    .from('integrations')
    .update({
      status: 'connected',
      auth_method: 'api_key',
      api_key: input.apiKey,
      api_secret: input.apiSecret || null,
      refresh_token: input.refreshToken || null,
      connected_at: new Date().toISOString(),
    })
    .eq('provider', provider)
    .select('*')
    .single()

  if (error) throw error
  return mapIntegration(data)
}

export async function disconnectIntegration(provider: IntegrationProvider): Promise<Integration> {
  const { data, error } = await supabase
    .from('integrations')
    .update({
      status: 'disconnected',
      auth_method: null,
      account_email: null,
      access_token: null,
      refresh_token: null,
      api_key: null,
      api_secret: null,
      connected_at: null,
    })
    .eq('provider', provider)
    .select('*')
    .single()

  if (error) throw error
  return mapIntegration(data)
}

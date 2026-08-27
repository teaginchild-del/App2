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
    providerAccountId: (row.provider_account_id as string | null) ?? null,
    tokenExpiresAt: (row.token_expires_at as string | null) ?? null,
    connectedAt: (row.connected_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }
}

export async function listIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase.from('integrations').select('*').order('display_name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapIntegration)
}

/**
 * URL for the OAuth login flow. Navigate the whole page here
 * (`window.location.href = ...`) rather than fetching it — the
 * integrations-oauth-start Edge Function 302s straight to the provider's
 * hosted login/consent screen, and the provider later redirects back to
 * `/configure/integrations` once integrations-oauth-callback has completed
 * the token exchange server-side.
 */
export function getOAuthLoginUrl(provider: IntegrationProvider): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return `${supabaseUrl}/functions/v1/integrations-oauth-start?provider=${provider}`
}

async function invokeIntegrationFn(name: string, body: Record<string, unknown>): Promise<Integration> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // FunctionsHttpError exposes the raw Response on `.context`; the
    // functions themselves reply with `{ error: string }` on failure, which
    // is a much better message than supabase-js's generic "non-2xx status".
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const body = await context.clone().json()
        if (typeof body?.error === 'string') throw new Error(body.error)
      } catch {
        // fall through to the generic error below
      }
    }
    throw error
  }
  return mapIntegration(data.integration)
}

export interface DeveloperCredentialsInput {
  apiKey: string
  apiSecret?: string
  refreshToken?: string
}

/**
 * Connect via manually-entered developer credentials. Routed through the
 * integrations-connect-credentials Edge Function so the raw key/secret are
 * written straight into `integration_credentials`, a table the anon key has
 * no read/write access to — the browser never gets them back.
 */
export async function connectIntegrationWithCredentials(
  provider: IntegrationProvider,
  input: DeveloperCredentialsInput,
): Promise<Integration> {
  return invokeIntegrationFn('integrations-connect-credentials', {
    provider,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
    refreshToken: input.refreshToken,
  })
}

export async function disconnectIntegration(provider: IntegrationProvider): Promise<Integration> {
  return invokeIntegrationFn('integrations-disconnect', { provider })
}

/** Manually refresh an OAuth-connected integration's access token before it expires. */
export async function refreshIntegrationToken(provider: IntegrationProvider): Promise<Integration> {
  return invokeIntegrationFn('integrations-refresh-token', { provider })
}

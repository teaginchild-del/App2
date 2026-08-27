// POST /integrations-refresh-token
// Body: { provider: 'quickbooks' | 'hubspot' }
//
// Exchanges the stored refresh_token for a new access_token (and, for
// QuickBooks, a rotated refresh_token — the old one stops working the moment
// a new one is issued). Only valid for integrations connected via OAuth
// login; API-key connections have nothing to refresh.
import { corsHeaders } from '../_shared/cors.ts'
import { adminClient } from '../_shared/admin.ts'
import { isProvider, refreshAccessToken } from '../_shared/providers.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()
    const provider = body.provider
    if (!isProvider(provider)) return json({ error: 'Unknown provider' }, 400)

    const supabase = adminClient()
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id, auth_method')
      .eq('provider', provider)
      .single()
    if (integrationError || !integration) throw new Error('Unknown integration')
    if (integration.auth_method !== 'oauth') {
      throw new Error('This integration is not connected via OAuth login, so there is no token to refresh')
    }

    const { data: creds, error: credsError } = await supabase
      .from('integration_credentials')
      .select('refresh_token')
      .eq('integration_id', integration.id)
      .single()
    if (credsError || !creds?.refresh_token) throw new Error('No refresh token on file for this integration')

    const token = await refreshAccessToken(provider, creds.refresh_token)
    const tokenExpiresAt = new Date(Date.now() + token.expiresInSeconds * 1000).toISOString()

    const { error: credUpdateError } = await supabase
      .from('integration_credentials')
      .update({ access_token: token.accessToken, refresh_token: token.refreshToken })
      .eq('integration_id', integration.id)
    if (credUpdateError) throw credUpdateError

    const { data: updated, error: updateError } = await supabase
      .from('integrations')
      .update({ token_expires_at: tokenExpiresAt, status: 'connected' })
      .eq('id', integration.id)
      .select('*')
      .single()
    if (updateError) throw updateError

    return json({ integration: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refresh token'
    return json({ error: message }, 500)
  }
})

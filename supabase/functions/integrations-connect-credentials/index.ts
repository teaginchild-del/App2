// POST /integrations-connect-credentials
// Body: { provider: 'quickbooks' | 'hubspot', apiKey: string, apiSecret?: string, refreshToken?: string }
//
// The "developer options" path in the Connect dialog: an admin pastes
// credentials issued directly from the provider's developer console (e.g. a
// HubSpot private-app token) instead of going through the hosted OAuth
// login. Called from the browser with the anon key (verify_jwt stays on),
// but it writes straight into `integration_credentials`, which the anon key
// itself has no read/write access to — only this function, running with the
// service-role key, can reach that table.
import { corsHeaders } from '../_shared/cors.ts'
import { adminClient } from '../_shared/admin.ts'
import { isProvider } from '../_shared/providers.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()
    const provider = body.provider
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : ''
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : ''

    if (!isProvider(provider)) return json({ error: 'Unknown provider' }, 400)
    if (!apiKey) return json({ error: 'API key is required' }, 400)

    const supabase = adminClient()
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id')
      .eq('provider', provider)
      .single()
    if (integrationError || !integration) throw new Error('Unknown integration')

    const { error: credError } = await supabase.from('integration_credentials').upsert(
      {
        integration_id: integration.id,
        api_key: apiKey,
        api_secret: apiSecret || null,
        refresh_token: refreshToken || null,
        access_token: null,
      },
      { onConflict: 'integration_id' },
    )
    if (credError) throw credError

    const { data: updated, error: updateError } = await supabase
      .from('integrations')
      .update({
        status: 'connected',
        auth_method: 'api_key',
        account_email: null,
        provider_account_id: null,
        token_expires_at: null,
        connected_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
      .select('*')
      .single()
    if (updateError) throw updateError

    return json({ integration: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect integration'
    return json({ error: message }, 500)
  }
})

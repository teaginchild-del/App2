// POST /integrations-disconnect
// Body: { provider: 'quickbooks' | 'hubspot' }
//
// Best-effort revokes the stored token with the provider, then deletes the
// integration_credentials row and resets the integration's public status.
import { corsHeaders } from '../_shared/cors.ts'
import { adminClient } from '../_shared/admin.ts'
import { isProvider, revokeToken } from '../_shared/providers.ts'

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
      .select('id')
      .eq('provider', provider)
      .single()
    if (integrationError || !integration) throw new Error('Unknown integration')

    const { data: creds } = await supabase
      .from('integration_credentials')
      .select('access_token, refresh_token')
      .eq('integration_id', integration.id)
      .maybeSingle()

    const tokenToRevoke = creds?.access_token ?? creds?.refresh_token
    if (tokenToRevoke) await revokeToken(provider, tokenToRevoke)

    await supabase.from('integration_credentials').delete().eq('integration_id', integration.id)

    const { data: updated, error: updateError } = await supabase
      .from('integrations')
      .update({
        status: 'disconnected',
        auth_method: null,
        account_email: null,
        provider_account_id: null,
        token_expires_at: null,
        connected_at: null,
      })
      .eq('id', integration.id)
      .select('*')
      .single()
    if (updateError) throw updateError

    return json({ integration: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect integration'
    return json({ error: message }, 500)
  }
})

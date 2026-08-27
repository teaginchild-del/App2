// GET /integrations-oauth-callback?code=...&state=...&realmId=...
//
// Public, unauthenticated endpoint (verify_jwt = false) — this is the
// redirect_uri registered with QuickBooks/HubSpot, hit by the provider's own
// server, so it can't carry an Authorization header either. The `state`
// param (minted by integrations-oauth-start and stored in `oauth_states`) is
// what proves this request is legitimate and identifies which provider it's
// for; it's deleted on first use so a replayed callback can't reconnect.
//
// This is the only place either provider's client secret is used to talk to
// the token endpoint — the secret never leaves this function.
import { adminClient } from '../_shared/admin.ts'
import { appUrl, exchangeCodeForToken, fetchAccountLabel } from '../_shared/providers.ts'
import type { Provider } from '../_shared/providers.ts'

const STATE_MAX_AGE_MS = 10 * 60 * 1000

function redirectWithError(provider: string | null, message: string): Response {
  const redirect = new URL('/configure/integrations', appUrl())
  redirect.searchParams.set('error', message)
  if (provider) redirect.searchParams.set('provider', provider)
  return Response.redirect(redirect.toString(), 302)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const realmId = url.searchParams.get('realmId') // QuickBooks-only
  const providerDeniedError = url.searchParams.get('error')

  if (!state) return redirectWithError(null, 'Missing OAuth state parameter')

  const supabase = adminClient()

  const { data: stateRow } = await supabase.from('oauth_states').select('*').eq('state', state).maybeSingle()
  if (!stateRow) {
    return redirectWithError(null, 'This connection request expired or was already used. Please try again.')
  }
  // Single-use: delete immediately so a replayed/duplicated callback can't reconnect.
  await supabase.from('oauth_states').delete().eq('state', state)

  const provider = stateRow.provider as Provider
  const ageMs = Date.now() - new Date(stateRow.created_at as string).getTime()
  if (ageMs > STATE_MAX_AGE_MS) {
    return redirectWithError(provider, 'This connection request expired. Please try again.')
  }
  if (providerDeniedError) {
    return redirectWithError(provider, `${provider} declined the connection request.`)
  }
  if (!code) return redirectWithError(provider, 'Missing authorization code')

  try {
    const token = await exchangeCodeForToken(provider, code)
    const { accountEmail, providerAccountId } = await fetchAccountLabel(provider, token.accessToken, realmId)

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id')
      .eq('provider', provider)
      .single()
    if (integrationError || !integration) throw new Error('Unknown integration')

    const tokenExpiresAt = new Date(Date.now() + token.expiresInSeconds * 1000).toISOString()

    const { error: credError } = await supabase.from('integration_credentials').upsert(
      {
        integration_id: integration.id,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        api_key: null,
        api_secret: null,
      },
      { onConflict: 'integration_id' },
    )
    if (credError) throw credError

    const { error: updateError } = await supabase
      .from('integrations')
      .update({
        status: 'connected',
        auth_method: 'oauth',
        account_email: accountEmail,
        provider_account_id: providerAccountId,
        token_expires_at: tokenExpiresAt,
        connected_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
    if (updateError) throw updateError

    const redirect = new URL('/configure/integrations', appUrl())
    redirect.searchParams.set('connected', provider)
    return Response.redirect(redirect.toString(), 302)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to complete the connection'
    return redirectWithError(provider, message)
  }
})

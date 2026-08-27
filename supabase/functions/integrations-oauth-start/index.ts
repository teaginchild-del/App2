// GET /integrations-oauth-start?provider=quickbooks|hubspot
//
// Public, unauthenticated endpoint (verify_jwt = false in config.toml) — the
// browser is navigated here directly (window.location.href), so there's no
// Authorization header to check. It mints a one-time CSRF state, stores it,
// and 302s the browser to the provider's hosted login/consent screen.
import { adminClient } from '../_shared/admin.ts'
import { appUrl, authorizeUrl, isProvider } from '../_shared/providers.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')

  if (!isProvider(provider)) {
    return new Response('Unknown or missing provider', { status: 400 })
  }

  try {
    const state = crypto.randomUUID()
    const supabase = adminClient()
    const { error } = await supabase.from('oauth_states').insert({ provider, state })
    if (error) throw error

    return Response.redirect(authorizeUrl(provider, state), 302)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start the connection'
    const redirect = new URL('/configure/integrations', appUrl())
    redirect.searchParams.set('error', message)
    redirect.searchParams.set('provider', provider)
    return Response.redirect(redirect.toString(), 302)
  }
})

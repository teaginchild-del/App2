// Provider-specific OAuth endpoints and token handling for QuickBooks and
// HubSpot. Client secrets are read from Edge Function secrets
// (`supabase secrets set ...`) and never returned to the caller.
//
// Reference docs (verify against current provider docs before relying on
// this in production — OAuth endpoints and scopes do change):
//   QuickBooks: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
//   HubSpot:    https://developers.hubspot.com/docs/api/oauth-quickstart-guide

export type Provider = 'quickbooks' | 'hubspot'

export function isProvider(value: unknown): value is Provider {
  return value === 'quickbooks' || value === 'hubspot'
}

function quickbooksEnvironment(): 'sandbox' | 'production' {
  return Deno.env.get('QUICKBOOKS_ENVIRONMENT') === 'production' ? 'production' : 'sandbox'
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function redirectUri(): string {
  return `${requireEnv('SUPABASE_URL')}/functions/v1/integrations-oauth-callback`
}

export function appUrl(): string {
  return Deno.env.get('APP_URL') ?? 'http://localhost:5173'
}

export function authorizeUrl(provider: Provider, state: string): string {
  const redirect = redirectUri()

  if (provider === 'quickbooks') {
    const params = new URLSearchParams({
      client_id: requireEnv('QUICKBOOKS_CLIENT_ID'),
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      state,
    })
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
  }

  const scopes = Deno.env.get('HUBSPOT_SCOPES') ?? 'crm.objects.contacts.read crm.objects.contacts.write'
  const params = new URLSearchParams({
    client_id: requireEnv('HUBSPOT_CLIENT_ID'),
    redirect_uri: redirect,
    scope: scopes,
    state,
  })
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

export interface TokenResult {
  accessToken: string
  refreshToken: string | null
  expiresInSeconds: number
}

interface TokenResponseBody {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

export async function exchangeCodeForToken(provider: Provider, code: string): Promise<TokenResult> {
  const redirect = redirectUri()

  if (provider === 'quickbooks') {
    const clientId = requireEnv('QUICKBOOKS_CLIENT_ID')
    const clientSecret = requireEnv('QUICKBOOKS_CLIENT_SECRET')
    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    })
    if (!res.ok) throw new Error(`QuickBooks token exchange failed (${res.status})`)
    const json = (await res.json()) as TokenResponseBody
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresInSeconds: json.expires_in ?? 3600,
    }
  }

  const clientId = requireEnv('HUBSPOT_CLIENT_ID')
  const clientSecret = requireEnv('HUBSPOT_CLIENT_SECRET')
  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      code,
    }),
  })
  if (!res.ok) throw new Error(`HubSpot token exchange failed (${res.status})`)
  const json = (await res.json()) as TokenResponseBody
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresInSeconds: json.expires_in ?? 1800,
  }
}

export async function refreshAccessToken(provider: Provider, refreshToken: string): Promise<TokenResult> {
  if (provider === 'quickbooks') {
    const clientId = requireEnv('QUICKBOOKS_CLIENT_ID')
    const clientSecret = requireEnv('QUICKBOOKS_CLIENT_SECRET')
    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    if (!res.ok) throw new Error(`QuickBooks token refresh failed (${res.status})`)
    const json = (await res.json()) as TokenResponseBody
    // QuickBooks rotates the refresh token on every use — the old one stops
    // working, so the new value must always be persisted.
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresInSeconds: json.expires_in ?? 3600,
    }
  }

  const clientId = requireEnv('HUBSPOT_CLIENT_ID')
  const clientSecret = requireEnv('HUBSPOT_CLIENT_SECRET')
  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`HubSpot token refresh failed (${res.status})`)
  const json = (await res.json()) as TokenResponseBody
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresInSeconds: json.expires_in ?? 1800,
  }
}

/** Best-effort account label lookup, purely cosmetic — failures never block a connect. */
export async function fetchAccountLabel(
  provider: Provider,
  accessToken: string,
  realmId: string | null,
): Promise<{ accountEmail: string | null; providerAccountId: string | null }> {
  try {
    if (provider === 'quickbooks') {
      if (!realmId) return { accountEmail: null, providerAccountId: null }
      const host =
        quickbooksEnvironment() === 'production'
          ? 'https://quickbooks.api.intuit.com'
          : 'https://sandbox-quickbooks.api.intuit.com'
      const res = await fetch(`${host}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
      if (!res.ok) return { accountEmail: null, providerAccountId: realmId }
      const json = await res.json()
      const label = json?.CompanyInfo?.CompanyName ?? json?.CompanyInfo?.Email?.Address ?? null
      return { accountEmail: label, providerAccountId: realmId }
    }

    const res = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`)
    if (!res.ok) return { accountEmail: null, providerAccountId: null }
    const json = await res.json()
    return {
      accountEmail: json.user ?? null,
      providerAccountId: json.hub_id != null ? String(json.hub_id) : null,
    }
  } catch {
    return { accountEmail: null, providerAccountId: realmId }
  }
}

/** Best-effort token revocation on disconnect. Never throws — disconnect proceeds either way. */
export async function revokeToken(provider: Provider, token: string): Promise<void> {
  try {
    if (provider === 'quickbooks') {
      const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')
      const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')
      if (!clientId || !clientSecret) return
      await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: JSON.stringify({ token }),
      })
    }
    // HubSpot has no public revoke-token API for OAuth apps; access is
    // revoked from the customer's HubSpot account (Settings > Connected Apps).
  } catch {
    // Best-effort only.
  }
}

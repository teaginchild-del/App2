import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Service-role Supabase client for Edge Function use only. SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are reserved env vars auto-injected by the
 * Supabase platform (and by `supabase start`/`supabase functions serve`
 * locally) — never set manually. The service-role key bypasses RLS, which is
 * exactly why `integration_credentials` and `oauth_states` carry no RLS
 * policies: only code running with this key can reach them.
 */
export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}

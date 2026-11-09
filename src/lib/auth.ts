import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { AppUser } from '@/lib/api/users'

export interface AuthState {
  /** True until the stored session (and the user's access record) has been checked. */
  loading: boolean
  session: Session | null
  /** The signed-in user's access record; null when signed out or the account was removed. */
  profile: AppUser | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Returns true when Supabase requires the user to confirm their email first. */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}

/** Only same-app paths are allowed as post-login redirects. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

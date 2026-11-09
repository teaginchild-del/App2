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
  /** Sends the sign-up confirmation email again. */
  resendConfirmation: (email: string) => Promise<void>
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

/** A sign-in/sign-up failure with a plain-language message; `code` is Supabase's error code. */
export type AuthFlowError = Error & { code?: string }

function authMessage(error: { code?: string; message: string; status?: number }): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Too many emails have been sent recently. Wait a few minutes, then try again.'
    case 'email_not_confirmed':
      return 'Confirm your email address first: open the link we emailed you, or send it again.'
    case 'invalid_credentials':
      return 'Incorrect email or password.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead.'
    case 'weak_password':
      return error.message || 'Choose a stronger password.'
    default:
      return error.status === 429 ? 'Too many attempts. Wait a minute, then try again.' : error.message
  }
}

/** Plain-language messages for the Supabase Auth errors people actually hit. */
export function friendlyAuthError(error: { code?: string; message: string; status?: number }): AuthFlowError {
  return Object.assign(new Error(authMessage(error)), { code: error.code })
}

import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IdleTimeout } from '@/components/auth/IdleTimeout'
import { getMyProfile, type AppUser } from '@/lib/api/users'
import { AuthContext, friendlyAuthError, type AuthState } from '@/lib/auth'
import { clearActivity, isIdleExpired, recordActivity, setSignedOutReason, type SignedOutReason } from '@/lib/idle'
import { supabase } from '@/lib/supabase'

/** Signs out this browser only; other devices stay signed in. */
async function endSession(reason: SignedOutReason | null) {
  setSignedOutReason(reason)
  clearActivity()
  await supabase.auth.signOut({ scope: 'local' })
}

/** A session restored from storage after more than the idle limit away is not accepted. */
function restoredSession(session: Session | null): Session | null {
  if (session && isIdleExpired(session.user.id)) {
    // Deferred: this can run inside Supabase's auth-change callback, where calling
    // other auth functions directly can deadlock.
    setTimeout(() => void endSession('idle'), 0)
    return null
  }
  return session
}

/** Starts the inactivity clock for a fresh sign-in and clears any "you were signed out" notice. */
function startedSession(session: Session | null) {
  if (!session) return
  recordActivity(session.user.id)
  setSignedOutReason(null)
}

/** Tracks the Supabase Auth session and the signed-in user's access record. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [profile, setProfile] = useState<{ userId: string; value: AppUser | null } | null>(null)
  const userId = session?.user.id ?? null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(restoredSession(data.session))
      setSessionChecked(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(event === 'INITIAL_SESSION' ? restoredSession(next) : next)
      setSessionChecked(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async (id: string) => {
    try {
      setProfile({ userId: id, value: await getMyProfile(id) })
    } catch {
      setProfile({ userId: id, value: null })
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    getMyProfile(userId).then(
      (value) => active && setProfile({ userId, value }),
      () => active && setProfile({ userId, value: null }),
    )
    return () => {
      active = false
    }
  }, [userId])

  const value = useMemo<AuthState>(() => {
    const current = userId && profile?.userId === userId ? profile.value : null
    return {
      loading: !sessionChecked || (userId != null && profile?.userId !== userId),
      session,
      profile: current,
      isAdmin: current?.role === 'admin' && current.status === 'active',
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw friendlyAuthError(error)
        startedSession(data.session)
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        })
        if (error) throw friendlyAuthError(error)
        startedSession(data.session)
        return { needsConfirmation: data.session == null }
      },
      resendConfirmation: async (email) => {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        })
        if (error) throw friendlyAuthError(error)
      },
      signOut: async () => {
        await endSession(null)
        setProfile(null)
      },
      refreshProfile: async () => {
        if (userId) await loadProfile(userId)
      },
    }
  }, [session, sessionChecked, profile, userId, loadProfile])

  const onIdleTimeout = useCallback(() => {
    void endSession('idle').then(() => setProfile(null))
  }, [])

  return (
    <AuthContext.Provider value={value}>
      {children}
      {userId && <IdleTimeout userId={userId} onTimeout={onIdleTimeout} />}
    </AuthContext.Provider>
  )
}

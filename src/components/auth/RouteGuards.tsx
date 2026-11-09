import { Clock, Landmark, ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

function FullPageMessage({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: ReactNode }) {
  const { session, signOut, refreshProfile } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <div className="mt-2 text-sm text-ink-muted">{children}</div>
        {session && <p className="mt-4 text-xs text-ink-subtle">Signed in as {session.user.email}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void refreshProfile()}>
            Check again
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 bg-surface-subtle text-sm text-ink-muted">
      <Landmark className="h-4 w-4 text-brand-600" />
      Loading…
    </div>
  )
}

/**
 * Protects every route inside it: signed-out visitors are sent to /login
 * (and returned here after signing in); accounts awaiting approval or
 * removed by an admin see a holding screen instead of the app. The
 * database enforces the same rules, so this is about the experience, not
 * the only line of defence.
 */
export function RequireAuth() {
  const { loading, session, profile } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (!session) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (!profile) {
    return (
      <FullPageMessage icon={ShieldOff} title="No access">
        This account no longer has access to the app. Ask an admin if you think this is a mistake.
      </FullPageMessage>
    )
  }
  if (profile.status === 'pending') {
    return (
      <FullPageMessage icon={Clock} title="Waiting for approval">
        Your account has been created. An admin needs to approve it before you can use the app.
      </FullPageMessage>
    )
  }
  return <Outlet />
}

/** Admin-only routes; other signed-in users are sent home. */
export function RequireAdmin() {
  const { isAdmin } = useAuth()
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />
}

import { Landmark, MailCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { AuthLoading } from '@/components/auth/RouteGuards'
import { ErrorBanner, Field, NoticeBanner } from '@/components/order-to-cash/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeNextPath, useAuth, type AuthFlowError } from '@/lib/auth'
import { useAction } from '@/lib/use-async'
import { cn } from '@/lib/utils'

const MIN_PASSWORD = 8
/** How long to wait before the confirmation email can be sent again. */
const RESEND_COOLDOWN_SECONDS = 30

export function Login() {
  const { loading, session, signIn, signUp } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  /** Set when a confirmation email is waiting: shows the "check your email" screen. */
  const [checkEmail, setCheckEmail] = useState<{ sentNow: boolean } | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const action = useAction()

  if (loading) return <AuthLoading />
  if (session) return <Navigate to={safeNextPath(params.get('next'))} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setUnconfirmed(false)
    await action.run(async () => {
      if (mode === 'sign_in') {
        try {
          await signIn(email.trim(), password)
        } catch (err) {
          if ((err as AuthFlowError).code === 'email_not_confirmed') setUnconfirmed(true)
          throw err
        }
        return
      }
      if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`)
      if (password !== confirm) throw new Error('The passwords don’t match.')
      const { needsConfirmation } = await signUp(email.trim(), password)
      if (needsConfirmation) setCheckEmail({ sentNow: true })
    })
  }

  const switchMode = (next: 'sign_in' | 'sign_up') => {
    setMode(next)
    setConfirm('')
    setUnconfirmed(false)
    action.setError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Landmark className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-ink">
            {checkEmail ? 'Check your email' : mode === 'sign_in' ? 'Sign in' : 'Create your account'}
          </h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {checkEmail ? (
            <CheckEmail
              email={email.trim()}
              sentNow={checkEmail.sentNow}
              onBack={() => {
                setCheckEmail(null)
                switchMode('sign_in')
              }}
            />
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
                {(['sign_in', 'sign_up'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={cn('rounded-md py-1.5', mode === m ? 'bg-white text-ink shadow-sm' : 'text-ink-muted')}
                  >
                    {m === 'sign_in' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>
              <form className="space-y-4" onSubmit={submit}>
                <Field label="Email">
                  <Input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Password" hint={mode === 'sign_up' ? `At least ${MIN_PASSWORD} characters` : undefined}>
                  <Input
                    type="password"
                    autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {mode === 'sign_up' && (
                  <Field label="Confirm password">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </Field>
                )}
                <ErrorBanner message={action.error} />
                {unconfirmed && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      action.setError(null)
                      setUnconfirmed(false)
                      setCheckEmail({ sentNow: false })
                    }}
                  >
                    Send the confirmation email again
                  </Button>
                )}
                <Button type="submit" className="w-full" disabled={action.pending}>
                  {action.pending ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
                </Button>
              </form>
            </>
          )}
        </div>
        {mode === 'sign_up' && !checkEmail && (
          <p className="mt-4 text-center text-xs text-ink-subtle">
            The first account becomes the admin. Later accounts need an admin’s approval.
          </p>
        )}
      </div>
    </div>
  )
}

/** Counts down to zero once per second; `restart` starts it again. */
function useCountdown(seconds: number, startRunning: boolean) {
  const [endsAt, setEndsAt] = useState(() => (startRunning ? Date.now() + seconds * 1000 : 0))
  const [now, setNow] = useState(() => Date.now())
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))

  useEffect(() => {
    if (remaining === 0) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [remaining])

  return {
    remaining,
    restart: () => {
      const start = Date.now()
      setNow(start)
      setEndsAt(start + seconds * 1000)
    },
  }
}

/**
 * "Check your email" screen. Resending unlocks after RESEND_COOLDOWN_SECONDS
 * and the countdown restarts after every resend, which keeps people under
 * Supabase's email rate limit.
 */
function CheckEmail({ email, sentNow, onBack }: { email: string; sentNow: boolean; onBack: () => void }) {
  const { resendConfirmation } = useAuth()
  const { remaining, restart } = useCountdown(RESEND_COOLDOWN_SECONDS, sentNow)
  const [resent, setResent] = useState(0)
  const action = useAction()

  const resend = async () => {
    if (await action.run(() => resendConfirmation(email))) {
      setResent((n) => n + 1)
      restart()
    }
  }

  return (
    <div className="text-center">
      <MailCheck className="mx-auto h-8 w-8 text-brand-600" />
      {sentNow || resent > 0 ? (
        <p className="mt-3 text-sm text-ink">
          We sent a confirmation link to <span className="font-medium">{email}</span>.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink">
          Send a new confirmation link to <span className="font-medium">{email}</span>.
        </p>
      )}
      <p className="mt-1 text-sm text-ink-muted">
        Open it, then sign in here. Check your spam folder if it isn’t there.
      </p>

      <div className="mt-5 space-y-3 text-left">
        {resent > 0 && !action.error && <NoticeBanner>Sent again. Only the newest link will work.</NoticeBanner>}
        <ErrorBanner message={action.error} />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Button onClick={resend} disabled={remaining > 0 || action.pending}>
          {action.pending
            ? 'Sending…'
            : remaining > 0
              ? `Resend email in ${remaining}s`
              : sentNow || resent > 0
                ? 'Resend email'
                : 'Send confirmation email'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    </div>
  )
}

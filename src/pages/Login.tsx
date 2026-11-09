import { Landmark, MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { AuthLoading } from '@/components/auth/RouteGuards'
import { ErrorBanner, Field } from '@/components/order-to-cash/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeNextPath, useAuth } from '@/lib/auth'
import { useAction } from '@/lib/use-async'
import { cn } from '@/lib/utils'

const MIN_PASSWORD = 8

export function Login() {
  const { loading, session, signIn, signUp } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)
  const action = useAction()

  if (loading) return <AuthLoading />
  if (session) return <Navigate to={safeNextPath(params.get('next'))} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await action.run(async () => {
      if (mode === 'sign_in') {
        await signIn(email.trim(), password)
        return
      }
      if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`)
      if (password !== confirm) throw new Error('The passwords don’t match.')
      const { needsConfirmation } = await signUp(email.trim(), password)
      if (needsConfirmation) setCheckEmail(true)
    })
  }

  const switchMode = (next: 'sign_in' | 'sign_up') => {
    setMode(next)
    setConfirm('')
    action.setError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Landmark className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold text-ink">{mode === 'sign_in' ? 'Sign in' : 'Create your account'}</h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {checkEmail ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-8 w-8 text-brand-600" />
              <p className="mt-3 text-sm text-ink">
                We sent a confirmation link to <span className="font-medium">{email}</span>.
              </p>
              <p className="mt-1 text-sm text-ink-muted">Open it, then sign in here.</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-5"
                onClick={() => {
                  setCheckEmail(false)
                  switchMode('sign_in')
                }}
              >
                Back to sign in
              </Button>
            </div>
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

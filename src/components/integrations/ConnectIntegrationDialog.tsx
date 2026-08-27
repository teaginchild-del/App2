import { KeyRound, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { connectIntegrationWithCredentials, connectIntegrationWithLogin } from '@/lib/api/integrations'
import type { Integration } from '@/types/integrations'

export function ConnectIntegrationDialog({
  integration,
  open,
  onClose,
  onConnected,
}: {
  integration: Integration | null
  open: boolean
  onClose: () => void
  onConnected: (integration: Integration) => void
}) {
  const [email, setEmail] = useState('')
  const [showDeveloperOptions, setShowDeveloperOptions] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail('')
    setShowDeveloperOptions(false)
    setApiKey('')
    setApiSecret('')
    setRefreshToken('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!integration) return null

  const handleLogin = async () => {
    if (!email.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await connectIntegrationWithLogin(integration.provider, email.trim())
      onConnected(updated)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${integration.displayName}.`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeveloperConnect = async () => {
    if (!apiKey.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await connectIntegrationWithCredentials(integration.provider, {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim() || undefined,
        refreshToken: refreshToken.trim() || undefined,
      })
      onConnected(updated)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${integration.displayName}.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`Connect ${integration.displayName}`}
      subtitle="Sign in with your account, or use developer credentials for an API-only connection."
    >
      <div className="space-y-5">
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Account email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`you@company.com`}
              autoFocus
            />
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={handleLogin}
            disabled={!email.trim() || submitting}
          >
            <LogIn className="h-4 w-4" />
            {submitting ? 'Connecting...' : `Log in to ${integration.displayName}`}
          </Button>
          <p className="text-xs text-ink-subtle">
            You'll be redirected to {integration.displayName} to sign in and authorize access.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowDeveloperOptions((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {showDeveloperOptions ? 'Hide developer options' : 'Developer options: use API keys instead'}
          </button>

          {showDeveloperOptions && (
            <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-surface-subtle p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">API key</label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste API key"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">API secret</label>
                <Input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Paste API secret (if required)"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Refresh token</label>
                <Input
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="Paste refresh token (optional)"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={handleDeveloperConnect}
                disabled={!apiKey.trim() || submitting}
              >
                {submitting ? 'Connecting...' : 'Connect with API keys'}
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}
      </div>
    </Dialog>
  )
}

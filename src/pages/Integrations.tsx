import { KeyRound, LogIn, Plug, RefreshCw, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConnectIntegrationDialog } from '@/components/integrations/ConnectIntegrationDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { disconnectIntegration, listIntegrations, refreshIntegrationToken } from '@/lib/api/integrations'
import type { Integration, IntegrationProvider } from '@/types/integrations'

const PROVIDER_STYLES: Record<IntegrationProvider, { letter: string; className: string; description: string }> = {
  quickbooks: {
    letter: 'Q',
    className: 'bg-emerald-600',
    description: 'Sync invoices, payments, and customers to QuickBooks Online.',
  },
  hubspot: {
    letter: 'H',
    className: 'bg-orange-500',
    description: 'Keep customer and subscription data in sync with HubSpot CRM.',
  },
}

const PROVIDER_DISPLAY_NAMES: Record<IntegrationProvider, string> = {
  quickbooks: 'QuickBooks',
  hubspot: 'HubSpot',
}

function formatTokenExpiry(tokenExpiresAt: string | null): string | null {
  if (!tokenExpiresAt) return null
  const diffMs = new Date(tokenExpiresAt).getTime() - Date.now()
  if (diffMs <= 0) return 'Access token expired — refresh to keep syncing'
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 60) return `Access token expires in ${minutes}m`
  return `Access token expires in ${Math.round(minutes / 60)}h`
}

export function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [connectingTarget, setConnectingTarget] = useState<Integration | null>(null)
  const [busyProvider, setBusyProvider] = useState<IntegrationProvider | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const load = () => {
    setLoading(true)
    setError(null)
    listIntegrations()
      .then(setIntegrations)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load integrations.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Picks up the redirect back from integrations-oauth-callback, which
  // encodes the outcome as ?connected=<provider> or ?error=<message>.
  useEffect(() => {
    const connectedProvider = searchParams.get('connected') as IntegrationProvider | null
    const oauthError = searchParams.get('error')
    if (connectedProvider) {
      setNotice(`${PROVIDER_DISPLAY_NAMES[connectedProvider] ?? connectedProvider} connected successfully.`)
    } else if (oauthError) {
      setError(oauthError)
    }
    if (connectedProvider || oauthError) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleConnected = (updated: Integration) => {
    setIntegrations((prev) => prev.map((i) => (i.provider === updated.provider ? updated : i)))
    setConnectingTarget(null)
  }

  const handleDisconnect = async (provider: IntegrationProvider) => {
    setBusyProvider(provider)
    setError(null)
    try {
      const updated = await disconnectIntegration(provider)
      setIntegrations((prev) => prev.map((i) => (i.provider === updated.provider ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect integration.')
    } finally {
      setBusyProvider(null)
    }
  }

  const handleRefreshToken = async (provider: IntegrationProvider) => {
    setBusyProvider(provider)
    setError(null)
    try {
      const updated = await refreshIntegrationToken(provider)
      setIntegrations((prev) => prev.map((i) => (i.provider === updated.provider ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh token.')
    } finally {
      setBusyProvider(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Integrations"
        description="Connect third-party tools to keep your billing data in sync."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {notice && (
          <div className="mb-4 rounded-lg border border-success-700/20 bg-success-50 px-4 py-3 text-sm text-success-700">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-danger-600/20 bg-danger-50 px-4 py-3 text-sm text-danger-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading integrations...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => {
              const style = PROVIDER_STYLES[integration.provider]
              const connected = integration.status === 'connected'
              const busy = busyProvider === integration.provider
              const tokenExpiryLabel =
                integration.authMethod === 'oauth' ? formatTokenExpiry(integration.tokenExpiresAt) : null

              return (
                <div
                  key={integration.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white ${style.className}`}
                      >
                        {style.letter}
                      </div>
                      <Badge variant={connected ? 'success' : 'neutral'} dot>
                        {connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-ink">{integration.displayName}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{style.description}</p>

                    {connected && (
                      <div className="mt-3 space-y-1 rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-muted">
                        <div className="flex items-center gap-1.5">
                          {integration.authMethod === 'oauth' ? (
                            <LogIn className="h-3.5 w-3.5" />
                          ) : (
                            <KeyRound className="h-3.5 w-3.5" />
                          )}
                          {integration.authMethod === 'oauth'
                            ? integration.accountEmail || 'Signed in'
                            : 'Connected via API key'}
                        </div>
                        {tokenExpiryLabel && <div>{tokenExpiryLabel}</div>}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {connected ? (
                      <>
                        {integration.authMethod === 'oauth' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => handleRefreshToken(integration.provider)}
                            disabled={busy}
                          >
                            <RefreshCw className="h-4 w-4" />
                            {busy ? 'Refreshing...' : 'Refresh token'}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          onClick={() => handleDisconnect(integration.provider)}
                          disabled={busy}
                        >
                          <Unplug className="h-4 w-4" />
                          {busy ? 'Disconnecting...' : 'Disconnect'}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" className="w-full" onClick={() => setConnectingTarget(integration)}>
                        <Plug className="h-4 w-4" />
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConnectIntegrationDialog
        integration={connectingTarget}
        open={connectingTarget !== null}
        onClose={() => setConnectingTarget(null)}
        onConnected={handleConnected}
      />
    </div>
  )
}

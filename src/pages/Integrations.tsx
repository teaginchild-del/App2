import { KeyRound, LogIn, Plug, Unplug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ConnectIntegrationDialog } from '@/components/integrations/ConnectIntegrationDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { disconnectIntegration, listIntegrations } from '@/lib/api/integrations'
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

export function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectingTarget, setConnectingTarget] = useState<Integration | null>(null)
  const [disconnectingProvider, setDisconnectingProvider] = useState<IntegrationProvider | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    listIntegrations()
      .then(setIntegrations)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load integrations.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleConnected = (updated: Integration) => {
    setIntegrations((prev) => prev.map((i) => (i.provider === updated.provider ? updated : i)))
    setConnectingTarget(null)
  }

  const handleDisconnect = async (provider: IntegrationProvider) => {
    setDisconnectingProvider(provider)
    try {
      const updated = await disconnectIntegration(provider)
      setIntegrations((prev) => prev.map((i) => (i.provider === updated.provider ? updated : i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect integration.')
    } finally {
      setDisconnectingProvider(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Integrations"
        description="Connect third-party tools to keep your billing data in sync."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    {connected ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => handleDisconnect(integration.provider)}
                        disabled={disconnectingProvider === integration.provider}
                      >
                        <Unplug className="h-4 w-4" />
                        {disconnectingProvider === integration.provider ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
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

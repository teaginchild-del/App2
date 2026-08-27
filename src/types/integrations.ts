export type IntegrationProvider = 'quickbooks' | 'hubspot'

export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

export type IntegrationAuthMethod = 'oauth' | 'api_key'

export interface Integration {
  id: string
  provider: IntegrationProvider
  displayName: string
  status: IntegrationStatus
  authMethod: IntegrationAuthMethod | null
  accountEmail: string | null
  providerAccountId: string | null
  tokenExpiresAt: string | null
  connectedAt: string | null
  updatedAt: string
}

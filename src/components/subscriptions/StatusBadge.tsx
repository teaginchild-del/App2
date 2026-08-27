import { Badge } from '@/components/ui/badge'
import type { SubscriptionStatus } from '@/types/billing'

const statusConfig: Record<SubscriptionStatus, { label: string; variant: 'success' | 'neutral' | 'warning' }> = {
  active: { label: 'Active', variant: 'success' },
  canceled: { label: 'Canceled', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'warning' },
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  )
}

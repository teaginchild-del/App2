import { Badge } from '@/components/ui/badge'
import type { CustomerStatus, LifecycleStage } from '@/types/customer'

const statusConfig: Record<CustomerStatus, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Active', variant: 'success' },
  trial: { label: 'Trial', variant: 'info' },
  past_due: { label: 'Past Due', variant: 'danger' },
  paused: { label: 'Paused', variant: 'warning' },
  canceled: { label: 'Canceled', variant: 'neutral' },
}

export function StatusBadge({ status }: { status: CustomerStatus }) {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  )
}

const stageConfig: Record<LifecycleStage, string> = {
  lead: 'Lead',
  opportunity: 'Opportunity',
  customer: 'Customer',
  churned: 'Churned',
}

export function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
  return <Badge variant="neutral">{stageConfig[stage]}</Badge>
}

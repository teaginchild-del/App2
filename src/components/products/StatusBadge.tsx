import { Badge } from '@/components/ui/badge'

export function ProductStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'success' : 'neutral'} dot>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  )
}

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { isCouponRedeemable } from '@/lib/billing-calculations'
import { listCoupons } from '@/lib/api/billing'
import type { Coupon } from '@/types/billing'

export function CouponPickerModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean
  onClose: () => void
  onApply: (coupon: Coupon) => void
}) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listCoupons()
      .then(setCoupons)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load coupons.'))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} title="Add Coupon" subtitle="Validated against expiration and redemption limits.">
      {error && <p className="mb-3 text-sm text-danger-600">{error}</p>}
      {loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">Loading coupons...</p>
      ) : coupons.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No coupons available.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {coupons.map((coupon) => {
            const { ok, reason } = isCouponRedeemable(coupon)
            return (
              <li key={coupon.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{coupon.name}</div>
                  <div className="truncate text-xs text-ink-subtle">
                    {coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `$${(coupon.discountValue / 100).toFixed(2)} off`}
                    {' · '}
                    {coupon.duration === 'once' ? 'one-time' : coupon.duration === 'forever' ? 'forever' : `${coupon.durationInPeriods} periods`}
                  </div>
                  {!ok && <div className="mt-0.5 text-xs text-danger-600">{reason}</div>}
                </div>
                <Button type="button" size="sm" variant="secondary" disabled={!ok} onClick={() => onApply(coupon)}>
                  Apply
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}

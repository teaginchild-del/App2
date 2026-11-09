import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, lastActivity, recordActivity } from '@/lib/idle'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const

/**
 * Watches for activity while someone is signed in. Shows a countdown for the
 * last IDLE_WARNING_MS and calls `onTimeout` once IDLE_TIMEOUT_MS pass with
 * no activity in any tab. Checks wall-clock time each second (and when the
 * tab becomes visible again), so a sleeping laptop is timed out on waking.
 */
export function IdleTimeout({ userId, onTimeout }: { userId: string; onTimeout: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    // Arriving without recorded activity (e.g. from an email link): start the clock now.
    if (lastActivity(userId) == null) recordActivity(userId)

    let lastWrite = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastWrite < 1000) return // at most one write per second
      lastWrite = now
      recordActivity(userId, now)
    }

    let timedOut = false
    const check = () => {
      if (timedOut) return
      const idle = Date.now() - (lastActivity(userId) ?? Date.now())
      if (idle >= IDLE_TIMEOUT_MS) {
        timedOut = true
        setSecondsLeft(null)
        onTimeout()
        return
      }
      const left = IDLE_TIMEOUT_MS - idle
      setSecondsLeft(left <= IDLE_WARNING_MS ? Math.ceil(left / 1000) : null)
    }

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { capture: true, passive: true })
    document.addEventListener('visibilitychange', check)
    const timer = setInterval(check, 1000)
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, { capture: true })
      document.removeEventListener('visibilitychange', check)
      clearInterval(timer)
    }
  }, [userId, onTimeout])

  if (secondsLeft == null) return null
  const stay = () => {
    recordActivity(userId)
    setSecondsLeft(null)
  }
  return (
    <Dialog open onClose={stay} title="Are you still there?" subtitle="You’ve been inactive for a while.">
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm text-ink">
          <Clock className="h-5 w-5 shrink-0 text-warning-600" />
          <span>
            For your security, you’ll be signed out in <span className="font-semibold tabular-nums">{secondsLeft}</span>{' '}
            second{secondsLeft === 1 ? '' : 's'}.
          </span>
        </div>
        <div className="flex justify-end">
          <Button onClick={stay}>Stay signed in</Button>
        </div>
      </div>
    </Dialog>
  )
}

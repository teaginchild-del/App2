/**
 * Inactivity timeout. People are signed out after IDLE_TIMEOUT_MS without
 * any mouse, keyboard, scroll or touch activity, with a warning shown for
 * the last IDLE_WARNING_MS.
 *
 * The time of the last activity is kept in localStorage, so activity in any
 * tab keeps every tab signed in, and time spent away (browser closed,
 * laptop asleep) counts too. It's stored per user, so one person's stale
 * timestamp can't sign out the next person to use the browser.
 */

export const IDLE_TIMEOUT_MS = 2 * 60 * 1000
export const IDLE_WARNING_MS = 20 * 1000

const ACTIVITY_KEY = 'auth:lastActivity'
const REASON_KEY = 'auth:signedOutReason'

/** Used when localStorage is unavailable (e.g. blocked in a private window). */
let memory: { userId: string; at: number } | null = null

function readActivity(): { userId: string; at: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (raw) return JSON.parse(raw) as { userId: string; at: number }
  } catch {
    // fall back to memory
  }
  return memory
}

/** When this user was last active in this browser, or null if unknown. */
export function lastActivity(userId: string): number | null {
  const entry = readActivity()
  return entry && entry.userId === userId && Number.isFinite(entry.at) ? entry.at : null
}

export function recordActivity(userId: string, at = Date.now()): void {
  memory = { userId, at }
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(memory))
  } catch {
    // memory copy is enough for this tab
  }
}

export function clearActivity(): void {
  memory = null
  try {
    localStorage.removeItem(ACTIVITY_KEY)
  } catch {
    // nothing stored
  }
}

/** True when this user's last recorded activity is older than the timeout. */
export function isIdleExpired(userId: string, now = Date.now()): boolean {
  const at = lastActivity(userId)
  return at != null && now - at >= IDLE_TIMEOUT_MS
}

export type SignedOutReason = 'idle'

/** Remembered across the sign-out so the login page can say why it appeared. */
export function setSignedOutReason(reason: SignedOutReason | null): void {
  try {
    if (reason) localStorage.setItem(REASON_KEY, reason)
    else localStorage.removeItem(REASON_KEY)
  } catch {
    // the notice is a nicety
  }
}

export function signedOutReason(): SignedOutReason | null {
  try {
    return localStorage.getItem(REASON_KEY) === 'idle' ? 'idle' : null
  } catch {
    return null
  }
}

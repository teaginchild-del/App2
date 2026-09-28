import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Loads data on mount / when `deps` change, with a `reload` for after
 * mutations. A response that arrives after the deps changed (or the
 * component unmounted) is dropped, so a slow request for a previous record
 * can't overwrite the current one.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    load().then(
      (data) => active && setState({ data, loading: false, error: null }),
      (err) => active && setState((s) => ({ ...s, loading: false, error: errorMessage(err) })),
    )
    return () => {
      active = false
    }
    // `load` is a fresh closure every render; callers list what it depends on in `deps`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { ...state, reload }
}

/** Runs a mutation, tracking its pending state and error message. */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setPending(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, error, setError, run }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return 'Something went wrong.'
}

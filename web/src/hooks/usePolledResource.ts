import { useEffect, useRef, useState } from 'react'

export interface Polled<T> {
  data: T | null
  /** true once a fetch has failed and we have no fresh data to show. */
  unavailable: boolean
  loading: boolean
}

/**
 * Polls `fetcher` on `intervalMs`, with three properties the kiosk needs:
 *
 *  1. Visibility-aware: stops polling while the tab is hidden / screen asleep
 *     (Page Visibility API), resumes with an immediate refresh.
 *  2. Backoff: on error the interval grows (cap 5×) so a dead endpoint can't
 *     hammer Prometheus/qBt; last good data is kept so the widget stays useful.
 *  3. Per-widget failure: never throws. `unavailable` flips on after an error
 *     with no cached data, and the component renders a friendly placeholder.
 */
export function usePolledResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
): Polled<T> {
  const [data, setData] = useState<T | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const failures = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()

    const schedule = (ms: number) => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(run, ms)
    }

    async function run() {
      if (document.hidden) {
        schedule(1000) // park cheaply until visible again
        return
      }
      try {
        const v = await fetcherRef.current(ctrl.signal)
        if (!alive) return
        setData(v)
        setUnavailable(false)
        failures.current = 0
      } catch (e) {
        if ((e as Error).name === 'AbortError' || !alive) return
        failures.current += 1
        setData((prev) => {
          if (prev == null) setUnavailable(true)
          return prev
        })
      } finally {
        if (alive) setLoading(false)
        const backoff = Math.min(5, 2 ** failures.current)
        schedule(intervalMs * (failures.current ? backoff : 1))
      }
    }

    const onVisible = () => {
      if (!document.hidden) {
        window.clearTimeout(timer.current)
        run()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    run()

    return () => {
      alive = false
      ctrl.abort()
      window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return { data, unavailable, loading }
}

/** Polling tiers — never faster than the data actually changes. */
export const POLL = {
  live: 5_000, // qBt/SAB speeds, queues, action state
  prom: 15_000, // Prometheus instant (= scrape interval)
  slow: 30_000, // load range, filesystem, alerts, Kuma
} as const

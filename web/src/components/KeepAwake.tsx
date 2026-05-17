import { useEffect, useRef, useState } from 'react'

/**
 * Top-bar 💡 "keep awake" toggle. Primary mechanism is the browser Screen Wake
 * Lock API. cage/wlroots honoring of wake-lock is not guaranteed — the
 * documented fallback (homelab `ansible/kiosk.yaml`) is a swayidle wrapper that
 * checks a BFF sentinel. The bulb reflects the *actual* lock, not just the tap:
 * if the lock can't be acquired it stays off so the user isn't misled.
 */
export function KeepAwake() {
  const [on, setOn] = useState(false)
  const lock = useRef<WakeLockSentinel | null>(null)

  async function acquire() {
    try {
      lock.current = await navigator.wakeLock?.request('screen')
      lock.current?.addEventListener('release', () => setOn(false))
      setOn(true)
    } catch {
      setOn(false)
    }
  }
  async function release() {
    try {
      await lock.current?.release()
    } catch {
      /* already gone */
    }
    lock.current = null
    setOn(false)
  }

  // Re-acquire after the screen wakes (wake locks drop on visibility loss).
  useEffect(() => {
    const onVis = () => {
      if (on && !document.hidden && !lock.current) acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [on])

  return (
    <button
      className={`bulb${on ? ' on' : ''}`}
      title={on ? 'Keep awake: ON (tap to allow sleep)' : 'Keep awake: OFF (auto-sleep 15 min)'}
      onClick={() => (on ? release() : acquire())}
    >
      💡
    </button>
  )
}

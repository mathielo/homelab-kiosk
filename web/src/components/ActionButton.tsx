import { useState } from 'react'

/**
 * A reversible toggle wired to a BFF verb. `active` is the *real* state from
 * /api/state (paused/throttled), not just "was tapped" — so the screen always
 * tells the truth even after an out-of-band change. Disabled (greyed) when the
 * state is unknown or actions are turned off server-side.
 */
export function ActionButton({
  active,
  onLabel,
  offLabel,
  disabled,
  onToggle,
}: {
  active: boolean | null
  onLabel: string
  offLabel: string
  disabled?: boolean
  onToggle: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const unknown = active === null || disabled

  async function click() {
    if (busy || unknown) return
    setBusy(true)
    try {
      await onToggle()
    } catch {
      /* state poll will reconcile; nothing to do here */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`act${active ? ' active' : ''}${unknown ? ' disabled' : ''}`}
      onClick={click}
      disabled={unknown || busy}
    >
      <span className={`led${active ? ' on' : ''}`} />
      <span className="lbl">{busy ? '…' : active ? onLabel : offLabel}</span>
    </button>
  )
}

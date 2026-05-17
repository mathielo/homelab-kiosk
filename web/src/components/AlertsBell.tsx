import { useState } from 'react'
import { promAlerts } from '../api/client'
import { usePolledResource, POLL } from '../hooks/usePolledResource'

/** Firing-alert indicator in the top bar, next to the clock. Tap to expand. */
export function AlertsBell() {
  const { data, unavailable } = usePolledResource(promAlerts, POLL.slow)
  const [open, setOpen] = useState(false)
  const alerts = data ?? []
  const count = alerts.length

  return (
    <div className="bell" onClick={() => setOpen((o) => !o)}>
      <span className={count ? 'ic firing' : 'ic'}>{unavailable ? '🔕' : '🔔'}</span>
      {count > 0 && <span className="badge-count">{count}</span>}
      {open && (
        <div className="alertpop" onClick={(e) => e.stopPropagation()}>
          {unavailable && <div className="amut">alerts unavailable</div>}
          {!unavailable && count === 0 && <div className="amut">no firing alerts</div>}
          {alerts.slice(0, 8).map((a, i) => (
            <div className="arow" key={i}>
              <b>{a.labels.alertname ?? 'alert'}</b>
              <span>{a.annotations.summary ?? a.labels.severity ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

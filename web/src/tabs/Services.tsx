import { kumaHeartbeat } from '../api/client'
import { usePolledResource, POLL } from '../hooks/usePolledResource'
import { Card } from '../components/primitives'

// Uptime Kuma status-page heartbeats (status.hl.mathielo.com). Reuses the
// existing Kuma instance — proxied through the BFF for a single origin.
export function Services() {
  const { data, unavailable } = usePolledResource(kumaHeartbeat, POLL.slow)

  if (unavailable && !data) {
    return (
      <div className="services">
        <Card title="Service health" unavailable className="grow">
          <></>
        </Card>
      </div>
    )
  }

  const monitors = (data?.publicGroupList ?? []).flatMap((g) => g.monitorList)
  return (
    <div className="services">
      <Card title="Service health — Uptime Kuma" className="grow">
        <div className="svcgrid">
          {monitors.map((m) => {
            const beats = data?.heartbeatList[String(m.id)] ?? []
            const last = beats[beats.length - 1]
            const up = last?.status === 1
            return (
              <div key={m.id} className="svc">
                <span className={`led ${up ? 'on' : 'off'}`} />
                <span className="svcname">{m.name}</span>
                <span className={up ? 'ok' : 'bad'}>{up ? 'up' : 'down'}</span>
              </div>
            )
          })}
          {monitors.length === 0 && <div className="sub">no monitors on this status page</div>}
        </div>
      </Card>
    </div>
  )
}

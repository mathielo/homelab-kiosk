import { getPihole, postAction } from '../api/client'
import { usePolledResource, POLL } from '../hooks/usePolledResource'
import { Card, KV } from '../components/primitives'
import { ActionButton } from '../components/ActionButton'

function PiholeCard() {
  const { data, unavailable } = usePolledResource(getPihole, POLL.slow)
  const blocked = data ? !data.blockingEnabled : false

  return (
    <Card title="Pi-hole" unavailable={unavailable && !data} className="grow">
      <div className="big" style={{ color: 'var(--accent)' }}>
        {data ? `${data.percentBlocked.toFixed(1)}%` : '—'}
      </div>
      <div className="sub">blocked of {data?.queriesTotal?.toLocaleString() ?? '—'} queries (24h)</div>
      <KV k="Domains on gravity" v={data?.gravityDomains?.toLocaleString() ?? '—'} />
      <KV
        k="Blocking"
        v={
          data ? (
            <span className={data.blockingEnabled ? 'ok' : 'bad'}>
              {data.blockingEnabled ? 'enabled' : `disabled${data.blockingTimer ? ` (${Math.round(data.blockingTimer)}s)` : ''}`}
            </span>
          ) : (
            '—'
          )
        }
      />
      <div className="acts">
        <ActionButton
          active={blocked}
          offLabel="⏸ Disable blocking 5 min"
          onLabel="▶ blocking off — tap to restore"
          onToggle={() => postAction(`pihole/blocking/${blocked ? 'enable' : 'disable'}`)}
        />
      </div>
    </Card>
  )
}

// UNAS-4 has no Prometheus source today (see config.ts) — the Network tab is
// Pi-hole only until a NAS exporter exists. No dead NAS tile.
export function Network() {
  return (
    <div className="network">
      <PiholeCard />
    </div>
  )
}

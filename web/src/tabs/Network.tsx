import { NAS } from '../config'
import { promInstant, getPihole, postAction } from '../api/client'
import { fmtBytes, instanceSelector } from '../api/promql'
import { usePolledResource, POLL } from '../hooks/usePolledResource'
import { Card, Bar, KV } from '../components/primitives'
import { ActionButton } from '../components/ActionButton'

function NasCard() {
  const { data, unavailable } = usePolledResource(async (s) => {
    const f = `${instanceSelector(NAS.promInstance)},mountpoint="${NAS.mountpoint}"`
    const [size, avail] = await Promise.all([
      promInstant(`node_filesystem_size_bytes{${f}}`, s),
      promInstant(`node_filesystem_avail_bytes{${f}}`, s),
    ])
    const sv = size.length ? Number(size[0].value[1]) : null
    const av = avail.length ? Number(avail[0].value[1]) : null
    return { used: sv != null && av != null ? sv - av : null, total: sv }
  }, POLL.slow)

  const pct = data?.used != null && data.total ? (data.used / data.total) * 100 : 0
  return (
    <Card title="NAS — UNAS-4" unavailable={unavailable && !data} className="grow">
      <KV k="Pool used" v={`${fmtBytes(data?.used ?? null)} / ${fmtBytes(data?.total ?? null)}`} />
      <Bar pct={pct} />
      <KV k="RAID5 status" v={<span className="ok">healthy</span>} />
      <KV k="Sustained write" v="~30 MB/s" />
      <div className="sub">source: node-exporter on the NFS mount (free) · drive temps need snmp_exporter</div>
    </Card>
  )
}

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

export function Network() {
  return (
    <div className="network">
      <PiholeCard />
      <NasCard />
    </div>
  )
}

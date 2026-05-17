import { QBT_INSTANCES, NAS_WRITE_CEILING_MBPS } from '../config'
import { getDownloads, getState, postAction } from '../api/client'
import { fmtMBps } from '../api/promql'
import { usePolledResource, POLL } from '../hooks/usePolledResource'
import { Card, KV } from '../components/primitives'
import { ActionButton } from '../components/ActionButton'

const SCALE = 80 // MB/s full-bar scale
const COLORS: Record<string, string> = { sab: 'var(--sab)', se: 'var(--se)', br: 'var(--br)' }

function IngestBar() {
  const dl = usePolledResource(getDownloads, POLL.live)
  const d = dl.data
  const sab = (d?.sabBps ?? 0) / 1e6
  const segs = [
    { key: 'sab', mbps: sab },
    ...(d?.qbt ?? []).map((q) => ({ key: q.name, mbps: (q.dlBps ?? 0) / 1e6 })),
  ]
  const total = segs.reduce((a, s) => a + s.mbps, 0)
  const status =
    total < NAS_WRITE_CEILING_MBPS - 6
      ? { c: 'ok', t: 'OK' }
      : total < NAS_WRITE_CEILING_MBPS + 4
        ? { c: 'warn', t: 'NEAR LIMIT' }
        : { c: 'bad', t: 'OVER — queue will back up' }

  return (
    <Card title="Download ingest → NAS write path" unavailable={dl.unavailable && !d} className="ingest">
      <div className="ih">
        <span className={`istat ${status.c}`}>{status.t}</span>
      </div>
      <div className="igbar">
        {segs.map((s) => (
          <i
            key={s.key}
            className="seg"
            style={{ width: `${(s.mbps / SCALE) * 100}%`, background: COLORS[s.key] ?? 'var(--accent)' }}
          />
        ))}
        <span className="ceil" style={{ left: `${(NAS_WRITE_CEILING_MBPS / SCALE) * 100}%` }}>
          <span>NAS ~{NAS_WRITE_CEILING_MBPS} MB/s</span>
        </span>
      </div>
      <div className="ilegend">
        <span>
          <i className="sw" style={{ background: 'var(--sab)' }} />
          SAB <b>{fmtMBps(d?.sabBps ?? null)}</b>
        </span>
        {(d?.qbt ?? []).map((q) => (
          <span key={q.name}>
            <i className="sw" style={{ background: COLORS[q.name] ?? 'var(--accent)' }} />
            qbt-{q.name} <b>{fmtMBps(q.dlBps)}</b>
          </span>
        ))}
        <span className="tot">
          Σ <b>{total.toFixed(0)} MB/s</b> · NAS sustains ~{NAS_WRITE_CEILING_MBPS}
        </span>
      </div>
    </Card>
  )
}

export function Downloads() {
  const dl = usePolledResource(getDownloads, POLL.live)
  const st = usePolledResource(getState, POLL.live)
  const d = dl.data
  const actionsOff = st.data ? !st.data.actionsEnabled : false
  const qbtState = (name: string) => st.data?.qbt.find((q) => q.name === name)
  const sabDl = d?.qbt ? d : null

  return (
    <div className="downloads">
      <div className="dlrow">
        <Card title="SABnzbd" unavailable={dl.unavailable && !d}>
          <div className="big sab">{fmtMBps(d?.sabBps ?? null)}</div>
          <KV k="Queue" v={`${d?.sabSlots ?? '—'} jobs`} />
          <div className="acts">
            <ActionButton
              active={st.data?.sabPaused ?? null}
              disabled={actionsOff}
              offLabel="⏸ Pause SABnzbd"
              onLabel="▶ SAB paused"
              onToggle={() => postAction(st.data?.sabPaused ? 'sab/resume' : 'sab/pause')}
            />
          </div>
        </Card>

        {QBT_INSTANCES.map((q) => {
          const live = sabDl?.qbt.find((x) => x.name === q.name)
          const stt = qbtState(q.name)
          return (
            <Card key={q.name} title={q.label}>
              <div className="sub">{q.exit}</div>
              <KV k="↓ / ↑" v={`${fmtMBps(live?.dlBps ?? null)} / ${fmtMBps(live?.upBps ?? null)}`} />
              <KV k="Torrents" v={live?.total ?? '—'} />
              <div className="acts">
                <ActionButton
                  active={stt?.freeleechPaused ?? null}
                  disabled={actionsOff}
                  offLabel="⏸ Pause freeleech"
                  onLabel="▶ freeleech held"
                  onToggle={() =>
                    postAction(`qbt/${q.name}/freeleech/${stt?.freeleechPaused ? 'resume' : 'pause'}`)
                  }
                />
                <ActionButton
                  active={stt?.throttled ?? null}
                  disabled={actionsOff}
                  offLabel="🐢 Throttle"
                  onLabel="🐢 Throttled"
                  onToggle={() => postAction(`qbt/${q.name}/throttle/toggle`)}
                />
              </div>
            </Card>
          )
        })}
      </div>
      <IngestBar />
    </div>
  )
}

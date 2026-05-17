import { K3S_NODES, type NodeDef } from '../config'
import { nodeVitals, loadSeries } from '../api/promql'
import { promInstant } from '../api/client'
import { usePolledResource, POLL } from '../hooks/usePolledResource'
import { Card, Bar, KV, Sparkline, Unavailable } from '../components/primitives'

function NodeCard({ node }: { node: NodeDef }) {
  const vitals = usePolledResource((s) => nodeVitals(node.promInstance, s), POLL.prom)
  const series = usePolledResource((s) => loadSeries(node.promInstance, s), POLL.slow)
  const v = vitals.data

  if (vitals.unavailable && !v) {
    return (
      <div className="ncard">
        <div className="nhead">
          <span className="nm">{node.name}</span>
          <span className="badge bad">unreachable</span>
        </div>
        <Unavailable what="node" />
      </div>
    )
  }
  return (
    <div className="ncard">
      <div className="nhead">
        <span className="nm">{node.name}</span>
        <span className="badge ok">Ready</span>
      </div>
      <Sparkline points={series.data ?? []} />
      <KV
        k="load 1m / 15m"
        v={`${v?.load1?.toFixed(2) ?? '—'} / ${v?.load15?.toFixed(2) ?? '—'}`}
      />
      <div>
        <KV k="CPU" v={v?.cpuPct != null ? `${v.cpuPct.toFixed(0)}%` : '—'} />
        <Bar pct={v?.cpuPct ?? 0} />
      </div>
      <div>
        <KV k="RAM" v={v?.ramPct != null ? `${v.ramPct.toFixed(0)}%` : '—'} />
        <Bar pct={v?.ramPct ?? 0} />
      </div>
    </div>
  )
}

function ClusterCard() {
  const { data, unavailable } = usePolledResource(async (s) => {
    const [running, pending, failed, nodes] = await Promise.all([
      promInstant('count(kube_pod_status_phase{phase="Running"}==1)', s),
      promInstant('count(kube_pod_status_phase{phase="Pending"}==1)', s),
      promInstant('count(kube_pod_status_phase{phase="Failed"}==1)', s),
      promInstant('count(kube_node_status_condition{condition="Ready",status="true"}==1)', s),
    ])
    const n = (v: typeof running) => (v.length ? Number(v[0].value[1]) : 0)
    return { running: n(running), pending: n(pending), failed: n(failed), nodes: n(nodes) }
  }, POLL.prom)

  return (
    <Card title="k3s cluster" unavailable={unavailable && !data} className="clusummary">
      <div className="bigrow">
        <div>
          <div className="big ok">{data?.running ?? '—'}</div>
          <div className="sub">running</div>
        </div>
        <div>
          <div className="big warn">{data?.pending ?? '—'}</div>
          <div className="sub">pending</div>
        </div>
        <div>
          <div className="big bad">{data?.failed ?? '—'}</div>
          <div className="sub">failed</div>
        </div>
        <div>
          <div className="big">{data?.nodes ?? '—'}</div>
          <div className="sub">nodes ready</div>
        </div>
      </div>
    </Card>
  )
}

export function Overview() {
  return (
    <div className="ov">
      <div className="nrow">
        {K3S_NODES.map((n) => (
          <NodeCard key={n.name} node={n} />
        ))}
      </div>
      <ClusterCard />
    </div>
  )
}

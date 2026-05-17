import { K3S_NODES, type NodeDef } from '../config'
import { nodeVitals, fsUsage, fmtBytes } from '../api/promql'
import { usePolledResource, POLL } from '../hooks/usePolledResource'
import { Bar, KV, Unavailable } from '../components/primitives'

function HostCard({ node }: { node: NodeDef }) {
  const vitals = usePolledResource((s) => nodeVitals(node.promInstance, s), POLL.prom)
  const fs = usePolledResource((s) => fsUsage(node.promInstance, node.mounts, s), POLL.slow)
  const v = vitals.data

  return (
    <div className="card">
      <h3>{node.name}</h3>
      {vitals.unavailable && !v ? (
        <Unavailable what="host" />
      ) : (
        <>
          <div>
            <KV k="CPU" v={v?.cpuPct != null ? `${v.cpuPct.toFixed(0)}%` : '—'} />
            <Bar pct={v?.cpuPct ?? 0} />
          </div>
          <div>
            <KV k="MEM" v={v?.ramPct != null ? `${v.ramPct.toFixed(0)}%` : '—'} />
            <Bar pct={v?.ramPct ?? 0} />
          </div>
          <div className="fsblock">
            {(fs.data ?? node.mounts.map((m) => ({ label: m.label, usedBytes: null, totalBytes: null }))).map(
              (f) => {
                const pct =
                  f.usedBytes != null && f.totalBytes ? (f.usedBytes / f.totalBytes) * 100 : 0
                return (
                  <div key={f.label}>
                    <KV
                      k={f.label}
                      v={`${fmtBytes(f.usedBytes)} / ${fmtBytes(f.totalBytes)}`}
                    />
                    <Bar pct={pct} />
                  </div>
                )
              },
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function Nodes() {
  return (
    <div className="nodes">
      {K3S_NODES.map((n) => (
        <HostCard key={n.name} node={n} />
      ))}
    </div>
  )
}

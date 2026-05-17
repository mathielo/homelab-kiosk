import { promInstant, promRange, type PromVector } from './client'

/** First sample value as a number, or null if the series is empty. */
function scalar(v: PromVector[]): number | null {
  return v.length ? Number(v[0].value[1]) : null
}

/**
 * Build an `instance` matcher for a node. node-exporter's label is the node
 * IP, sometimes with a `:port` suffix — match the IP exactly (dots escaped so
 * they aren't regex wildcards) with an optional port. Prometheus `=~` is
 * already fully anchored, so no `^…$` needed.
 */
export function instanceSelector(inst: string): string {
  const ip = inst.replace(/\./g, '\\.')
  return `instance=~"${ip}(:[0-9]+)?"`
}
const sel = instanceSelector

export interface NodeVitals {
  cpuPct: number | null
  ramPct: number | null
  load1: number | null
  load15: number | null
}

export async function nodeVitals(inst: string, signal: AbortSignal): Promise<NodeVitals> {
  const [cpu, ram, l1, l15] = await Promise.all([
    promInstant(`100 - avg(rate(node_cpu_seconds_total{mode="idle",${sel(inst)}}[5m]))*100`, signal),
    promInstant(`(1 - node_memory_MemAvailable_bytes{${sel(inst)}} / node_memory_MemTotal_bytes{${sel(inst)}})*100`, signal),
    promInstant(`node_load1{${sel(inst)}}`, signal),
    promInstant(`node_load15{${sel(inst)}}`, signal),
  ])
  return { cpuPct: scalar(cpu), ramPct: scalar(ram), load1: scalar(l1), load15: scalar(l15) }
}

/** ~3h load-average series for the sparkline. */
export async function loadSeries(inst: string, signal: AbortSignal): Promise<number[]> {
  const m = await promRange(`node_load1{${sel(inst)}}`, 3 * 3600, 600, signal)
  return m.length ? m[0].values.map(([, v]) => Number(v)) : []
}

export interface FsUsage {
  label: string
  usedBytes: number | null
  totalBytes: number | null
}

export async function fsUsage(
  inst: string,
  mounts: { label: string; mountpoint: string }[],
  signal: AbortSignal,
): Promise<FsUsage[]> {
  return Promise.all(
    mounts.map(async (m) => {
      const f = `${sel(inst)},mountpoint="${m.mountpoint}"`
      const [size, avail] = await Promise.all([
        promInstant(`node_filesystem_size_bytes{${f}}`, signal),
        promInstant(`node_filesystem_avail_bytes{${f}}`, signal),
      ])
      const s = scalar(size)
      const a = scalar(avail)
      return {
        label: m.label,
        usedBytes: s !== null && a !== null ? s - a : null,
        totalBytes: s,
      }
    }),
  )
}

export function fmtBytes(n: number | null): string {
  if (n === null) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export function fmtMBps(bps: number | null): string {
  return bps === null ? '—' : `${(bps / 1e6).toFixed(1)} MB/s`
}

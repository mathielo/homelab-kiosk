// Thin typed client for the BFF. Every call throws on a non-OK response so
// `usePolledResource` can render the per-widget "unavailable" state and retry;
// no call ever returns partial/garbage data silently.

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return (await r.json()) as T
}

export interface PromVector {
  metric: Record<string, string>
  value: [number, string]
}
export interface PromMatrix {
  metric: Record<string, string>
  values: [number, string][]
}

interface PromResp<R> {
  status: string
  data: { resultType: string; result: R }
}

export async function promInstant(query: string, signal?: AbortSignal): Promise<PromVector[]> {
  const r = await getJSON<PromResp<PromVector[]>>(
    `/api/prom/query?query=${encodeURIComponent(query)}`,
    signal,
  )
  if (r.status !== 'success') throw new Error('prometheus error')
  return r.data.result
}

export async function promRange(
  query: string,
  rangeSec: number,
  stepSec: number,
  signal?: AbortSignal,
): Promise<PromMatrix[]> {
  const end = Math.floor(Date.now() / 1000)
  const start = end - rangeSec
  const u =
    `/api/prom/query_range?query=${encodeURIComponent(query)}` +
    `&start=${start}&end=${end}&step=${stepSec}`
  const r = await getJSON<PromResp<PromMatrix[]>>(u, signal)
  if (r.status !== 'success') throw new Error('prometheus error')
  return r.data.result
}

export interface PromAlert {
  labels: Record<string, string>
  annotations: Record<string, string>
  state: string
}
export async function promAlerts(signal?: AbortSignal): Promise<PromAlert[]> {
  const r = await getJSON<{ status: string; data: { alerts: PromAlert[] } }>(
    '/api/prom/alerts',
    signal,
  )
  return (r.data?.alerts ?? []).filter((a) => a.state === 'firing')
}

export interface KumaHeartbeat {
  heartbeatList: Record<string, { status: number; time: string }[]>
  publicGroupList: { name: string; monitorList: { id: number; name: string }[] }[]
}
export function kumaHeartbeat(signal?: AbortSignal): Promise<KumaHeartbeat> {
  return getJSON<KumaHeartbeat>('/api/kuma/heartbeat', signal)
}

export interface ActionState {
  actionsEnabled: boolean
  sabPaused: boolean | null
  qbt: { name: string; freeleechPaused: boolean | null; throttled: boolean | null }[]
}
export function getState(signal?: AbortSignal): Promise<ActionState> {
  return getJSON<ActionState>('/api/state', signal)
}

export interface Downloads {
  sabBps: number | null
  sabSlots: number | null
  qbt: { name: string; dlBps: number | null; upBps: number | null; total: number | null }[]
}
export function getDownloads(signal?: AbortSignal): Promise<Downloads> {
  return getJSON<Downloads>('/api/downloads', signal)
}

export interface Pihole {
  percentBlocked: number
  queriesTotal: number
  blocked: number
  gravityDomains: number
  blockingEnabled: boolean
  blockingTimer: number | null
}
export function getPihole(signal?: AbortSignal): Promise<Pihole> {
  return getJSON<Pihole>('/api/pihole', signal)
}

export async function postAction(path: string): Promise<void> {
  const r = await fetch(`/api/actions/${path}`, { method: 'POST' })
  if (!r.ok) throw new Error(`action ${path} -> ${r.status}`)
}

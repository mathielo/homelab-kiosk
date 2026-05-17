import type { ReactNode } from 'react'

export function Unavailable({ what }: { what: string }) {
  return (
    <div className="unavailable">
      <span className="led off" />
      {what} unavailable
    </div>
  )
}

/** Card with a built-in unavailable state so every widget degrades the same way. */
export function Card({
  title,
  unavailable,
  children,
  className,
}: {
  title?: string
  unavailable?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`card${className ? ' ' + className : ''}`}>
      {title && <h3>{title}</h3>}
      {unavailable ? <Unavailable what={title ?? 'data'} /> : children}
    </div>
  )
}

function tone(pct: number) {
  return pct < 60 ? 'var(--ok)' : pct < 85 ? 'var(--warn)' : 'var(--bad)'
}

export function Bar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="bar">
      <i style={{ width: `${p}%`, background: tone(p) }} />
    </div>
  )
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

/** Compact SVG sparkline from a numeric series (no chart library needed). */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <svg className="spark" viewBox="0 0 100 32" />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * 100
      const yy = 30 - ((y - min) / span) * 28
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yy.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none">
      <path d={`${d} L100,32 L0,32 Z`} fill="rgba(91,141,239,.14)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  )
}

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { TABS, type TabName } from './config'
import { Overview } from './tabs/Overview'
import { Nodes } from './tabs/Nodes'
import { Downloads } from './tabs/Downloads'
import { Network } from './tabs/Network'
import { Services } from './tabs/Services'
import { AlertsBell } from './components/AlertsBell'
import { KeepAwake } from './components/KeepAwake'
import { ErrorBoundary } from './components/ErrorBoundary'

const VIEWS: Record<TabName, () => ReactElement> = {
  Overview,
  Nodes,
  Downloads,
  Network,
  Services,
}
const ICONS: Record<TabName, string> = {
  Overview: '▦',
  Nodes: '🖥️',
  Downloads: '⬇',
  Network: '🌐',
  Services: '🟢',
}

export function App() {
  const [idx, setIdx] = useState(0)
  const [clock, setClock] = useState('')
  const start = useRef<{ x: number; y: number; onBtn: boolean } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])

  const go = (i: number) => setIdx(Math.max(0, Math.min(TABS.length - 1, i)))

  // Swipe between panes (touch + mouse drag). A gesture that begins on an
  // action button is ignored so taps never get eaten by the swipe handler.
  const down = (x: number, y: number, target: EventTarget | null) => {
    start.current = { x, y, onBtn: !!(target as HTMLElement)?.closest?.('.act,.bulb,.bell') }
  }
  const up = (x: number, y: number) => {
    const s = start.current
    start.current = null
    if (!s || s.onBtn) return
    const dx = x - s.x
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(y - s.y)) go(idx + (dx < 0 ? 1 : -1))
  }

  return (
    <div className="device">
      <div className="topbar">
        <div className="l">🏠 Homelab</div>
        <div className="c">
          <span>{TABS[idx]}</span>
          <span className="dots">
            {TABS.map((t, i) => (
              <i key={t} className={i === idx ? 'on' : ''} />
            ))}
          </span>
        </div>
        <div className="r">
          <AlertsBell />
          <KeepAwake />
          <span className="dot ok" />
          <span>{clock}</span>
        </div>
      </div>

      <div
        className="content"
        onTouchStart={(e) => down(e.touches[0].clientX, e.touches[0].clientY, e.target)}
        onTouchEnd={(e) => up(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
        onMouseDown={(e) => down(e.clientX, e.clientY, e.target)}
        onMouseUp={(e) => up(e.clientX, e.clientY)}
      >
        <div
          className="track"
          style={{
            width: `${TABS.length * 100}%`,
            transform: `translateX(-${idx * (100 / TABS.length)}%)`,
          }}
        >
          {TABS.map((name) => {
            const View = VIEWS[name]
            return (
              <section className="view" key={name} style={{ width: `${100 / TABS.length}%` }}>
                <ErrorBoundary label={name}>
                  <View />
                </ErrorBoundary>
              </section>
            )
          })}
        </div>
      </div>

      <div className="tabbar">
        {TABS.map((name, i) => (
          <button
            key={name}
            className={`tab${i === idx ? ' on' : ''}`}
            onClick={() => go(i)}
          >
            <span className="ic">{ICONS[name]}</span>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

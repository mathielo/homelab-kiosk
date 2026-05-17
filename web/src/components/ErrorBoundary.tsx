import { Component, type ReactNode } from 'react'

/**
 * Isolates a render crash to one tab. All tabs are mounted at once (the swipe
 * track needs them side-by-side), so without this a single throwing component
 * would blank the whole kiosk. The fallback reuses the `.unavailable` look so a
 * crashed tab degrades exactly like an unreachable widget, with a retry that
 * remounts just that subtree — the other tabs keep their warm data.
 */
export class ErrorBoundary extends Component<
  { label: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    console.error(`kiosk: "${this.props.label}" tab crashed —`, err)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="unavailable">
        <span className="led off" />
        {this.props.label} crashed
        <button className="retry" onClick={() => this.setState({ failed: false })}>
          retry
        </button>
      </div>
    )
  }
}

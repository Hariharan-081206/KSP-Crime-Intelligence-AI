import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import './ErrorBoundary.css'

/**
 * Last line of defence against a blank page.
 *
 * React unmounts the entire tree when a render throws, so before this existed a
 * single bad response — e.g. Leaflet being handed a 404 body instead of GeoJSON
 * — turned the whole portal white with nothing on screen to explain it. Only a
 * class component can catch that.
 *
 * Wrap it around the routed area, NOT around AuthProvider: the providers must
 * survive so "Try again" can re-render the route without a full reload.
 *
 * @param {{ children: React.ReactNode }} props
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // The stack is the only diagnostic a deployed build gives us — keep it.
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="error-boundary" role="alert">
        <AlertTriangle size={22} />
        <h2>Something went wrong in this view</h2>
        <p>
          The rest of the portal is still running. Reloading usually clears it; if it keeps
          happening, the message below is what to report.
        </p>
        <pre className="error-boundary-detail">{error?.message || String(error)}</pre>
        <div className="error-boundary-actions">
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}

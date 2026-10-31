import { Component } from 'react'
import { track } from '../lib/analytics.js'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    track('App Error', { message: String(error?.message || error).slice(0, 120) })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="wrap-narrow" style={{ padding: '48px 16px' }}>
        <div className="card">
          <h1 style={{ fontSize: 28 }}>Something went sideways.</h1>
          <p style={{ marginTop: 10 }}>
            The contest page hit a snag. Reloading usually fixes it. If you were paying for votes, your payment is safe:
            votes are credited as soon as the payment confirms, whether or not this page is open.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}

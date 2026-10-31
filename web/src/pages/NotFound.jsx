import { NEWSROOM } from '../config.js'
import { useDocumentTitle } from '../lib/hooks.js'

export default function NotFound() {
  useDocumentTitle(`Page not found — ${NEWSROOM.name}`)
  return (
    <div className="wrap section">
      <div className="card">
        <h1 style={{ fontSize: 30 }}>This page wandered off.</h1>
        <p style={{ marginTop: 10 }}>The link may be old or mistyped. The pets are all still here.</p>
        <a className="btn btn-primary" href="#/">
          Back to the contest
        </a>
      </div>
    </div>
  )
}

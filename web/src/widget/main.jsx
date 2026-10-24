// Entry for widget.html, the article widget. Its own page so an embed in a
// story loads React, the public data client and this card, and nothing else:
// no Stripe, no admin desk, no gallery.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initAnalytics } from '../lib/analytics.js'
import { startEmbedReporting } from '../lib/embed.js'
import { APP_BASE, PUBLIC_URL } from '../lib/env.js'
import { parseWidgetParams } from '../lib/widget.js'
import Widget from './Widget.jsx'
import './widget.css'

initAnalytics()
startEmbedReporting({ type: 'wpr-pets-widget-height' })

// Taps land on the contest page on wausaupilotandreview.com, or wherever ?to=
// names on that site. Without a configured page, the standalone app.
const params = parseWidgetParams(window.location.search, { fallback: PUBLIC_URL || APP_BASE })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Widget params={params} />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initAnalytics } from './lib/analytics.js'
import { startEmbedReporting } from './lib/embed.js'
import './styles/app.css'

initAnalytics()
startEmbedReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

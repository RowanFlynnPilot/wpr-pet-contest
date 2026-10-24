import { WPR_BADGE, WPR_LOGO, WPR_TAGLINE, WPR_URL } from '../config.js'
import { EMBEDDED } from '../lib/env.js'

// WPR's flag, centered, over the thick-over-thin rule. The contest's own title
// sits below it in the banner, never above. Not drawn inside the WordPress
// iframe: the page around it is already WPR's, masthead and all.
export default function Masthead() {
  if (EMBEDDED) return null
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  })
  return (
    <div className="masthead">
      <a className="masthead-flag" href={WPR_URL} target="_blank" rel="noopener noreferrer" aria-label="Wausau Pilot & Review home">
        <img
          className="badge"
          src={WPR_BADGE}
          alt=""
          width="62"
          height="62"
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        <img className="wordmark" src={WPR_LOGO} alt="Wausau Pilot & Review" width="422" height="54" decoding="async" />
      </a>
      <div className="masthead-tagline">{WPR_TAGLINE}</div>
      <div className="masthead-dateline">
        <span>{today}</span>
        <span>Wausau, Wisconsin</span>
      </div>
    </div>
  )
}

import { NEWSROOM } from '../config.js'
import { EMBEDDED } from '../lib/env.js'

// The newsroom's flag, centered, over the thick-over-thin rule. The contest's
// own title sits below it in the banner, never above. Not drawn inside the
// WordPress iframe: the page around it is already the newsroom's, masthead
// and all. A newsroom without a badge and wordmark gets its name set in the
// display face instead.
export default function Masthead() {
  if (EMBEDDED) return null
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: NEWSROOM.timeZone,
  })
  return (
    <div className="masthead">
      <a className="masthead-flag" href={NEWSROOM.url} target="_blank" rel="noopener noreferrer" aria-label={`${NEWSROOM.name} home`}>
        {NEWSROOM.badge && (
          <img
            className="badge"
            src={NEWSROOM.badge}
            alt=""
            width="62"
            height="62"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        {NEWSROOM.wordmark ? (
          <img className="wordmark" src={NEWSROOM.wordmark} alt={NEWSROOM.name} width="422" height="54" decoding="async" />
        ) : (
          <span className="masthead-name">{NEWSROOM.name}</span>
        )}
      </a>
      {NEWSROOM.tagline && <div className="masthead-tagline">{NEWSROOM.tagline}</div>}
      <div className="masthead-dateline">
        <span>{today}</span>
        <span>
          {NEWSROOM.city}, {NEWSROOM.state}
        </span>
      </div>
    </div>
  )
}

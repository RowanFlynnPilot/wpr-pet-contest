import { useContest } from './ContestContext.jsx'

export function navItems(phase) {
  const entering = phase === 'coming' || phase === 'submissions'
  const done = phase === 'complete'
  const bracket = ['voting', 'counting', 'intermission'].includes(phase)
  return [
    { name: 'home', label: 'Home', emoji: '🏠', href: '#/' },
    entering && { name: 'enter', label: 'Enter', emoji: '📸', href: '#/enter' },
    { name: 'gallery', label: 'Pets', emoji: '🐶', href: '#/gallery' },
    bracket && { name: 'bracket', label: 'Bracket', emoji: '🏆', href: '#/bracket' },
    done && { name: 'results', label: 'Results', emoji: '👑', href: '#/results' },
    { name: 'shelters', label: 'Shelters', emoji: '❤️', href: '#/shelters' },
    { name: 'rules', label: 'Rules', emoji: '📋', href: '#/rules' },
  ].filter(Boolean)
}

export default function Nav({ route }) {
  const { phase } = useContest()
  const items = navItems(phase)
  const current = route.name === 'pet' ? 'gallery' : route.name
  const cta =
    phase === 'submissions'
      ? { href: '#/enter', label: 'Enter your pet' }
      : phase === 'voting'
        ? { href: '#/gallery', label: 'Vote now' }
        : null
  return (
    <nav className="nav" aria-label="Contest">
      <div className="wrap nav-inner">
        <ul className="nav-links">
          {items.map((item) => (
            <li key={item.name}>
              <a href={item.href} aria-current={current === item.name ? 'page' : undefined}>
                <span className="nav-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="nav-label">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
        {cta && current !== 'enter' && route.name !== 'pet' && (
          <a className="btn btn-primary btn-sm nav-cta" href={cta.href}>
            {cta.label}
          </a>
        )}
      </div>
    </nav>
  )
}

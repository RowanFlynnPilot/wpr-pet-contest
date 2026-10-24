import { useContest } from './ContestContext.jsx'

export function navItems(phase) {
  const entering = phase === 'coming' || phase === 'submissions'
  const done = phase === 'complete'
  const bracket = ['voting', 'counting', 'intermission'].includes(phase)
  return [
    { name: 'home', label: 'Home', href: '#/' },
    entering && { name: 'enter', label: 'Enter', href: '#/enter' },
    { name: 'gallery', label: 'Pets', href: '#/gallery' },
    bracket && { name: 'bracket', label: 'Bracket', href: '#/bracket' },
    done && { name: 'results', label: 'Results', href: '#/results' },
    { name: 'shelters', label: 'Shelters', href: '#/shelters' },
    { name: 'rules', label: 'Rules', href: '#/rules' },
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
                {item.label}
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

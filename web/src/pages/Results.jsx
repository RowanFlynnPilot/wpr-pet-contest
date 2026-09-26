import { useMemo } from 'react'
import { useContest } from '../components/ContestContext.jsx'
import PetPhoto from '../components/PetPhoto.jsx'
import RaisedCounter from '../components/RaisedCounter.jsx'
import { useBracket, useEntries, useSideAwards } from '../lib/data.js'
import { fmtInt, fmtMoney } from '../lib/format.js'
import { useDocumentTitle, useReducedMotion } from '../lib/hooks.js'
import { finalSeq } from '../lib/rounds.js'
import { BracketBoard } from './Bracket.jsx'

const CONFETTI = ['#f4b942', '#3a867c', '#ffffff', '#e1edea', '#f7c860']

function Confetti() {
  const reduced = useReducedMotion()
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 9) * 0.12}s`,
        color: CONFETTI[i % CONFETTI.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [],
  )
  if (reduced) return null
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: b.left, animationDelay: b.delay, background: b.color, transform: `rotate(${b.rotate})` }} />
      ))}
    </div>
  )
}

export function Champion({ c, byId }) {
  const { matchups } = useBracket(c.rounds)
  const final = c.rounds.find((r) => r.seq === finalSeq(c.bracketSize))
  const m = final && matchups.find((x) => x.round_id === final.id)
  const champ = m?.winner_entry_id ? byId.get(m.winner_entry_id) : null
  const runnerUp = champ && byId.get(m.entry_a_id === champ.id ? m.entry_b_id : m.entry_a_id)
  if (!champ) return null
  return (
    <section className="champion" aria-labelledby="champ-title">
      <Confetti />
      <PetPhoto entry={champ} width={800} eager />
      <div>
        <p className="kicker">{c.contest.year} champion · seed {champ.seed}</p>
        <h2 id="champ-title">{champ.pet_name}</h2>
        <p>
          of {champ.town} is the {c.contest.name}
          {runnerUp ? `, beating ${runnerUp.pet_name} in the Championship` : ''}.
          {c.stats ? ` Together, voters raised ${fmtMoney(c.stats.shelter_cents, { whole: true })} for local animal shelters.` : ''}
        </p>
        <a className="btn btn-sun" href={`#/pet/${champ.id}`}>
          Congratulate {champ.pet_name}
        </a>
      </div>
    </section>
  )
}

const AWARD = { dog: 'Best Dog', cat: 'Best Cat', other: 'Best Other' }

export function SideAwards({ c, byId }) {
  const round1Done = c.rounds.some((r) => r.seq === 1 && r.status === 'resolved')
  const awards = useSideAwards(c.contest?.id, round1Done)
  if (!awards.length) return null
  const order = ['dog', 'cat', 'other']
  return (
    <section className="section" aria-labelledby="awards-title">
      <div className="section-head">
        <div>
          <p className="kicker">Side awards · from Open Round votes</p>
          <h2 id="awards-title">Best in species</h2>
        </div>
      </div>
      <div className="awards">
        {[...awards]
          .sort((a, b) => order.indexOf(a.species) - order.indexOf(b.species))
          .map((a) => (
            <a className="award" key={a.species} href={`#/pet/${a.entry_id}`}>
              <PetPhoto entry={byId.get(a.entry_id) || { pet_name: a.pet_name }} width={200} square alt="" />
              <span>
                <span className="award-title">{AWARD[a.species] || 'Best'}</span>
                <span className="award-name" style={{ display: 'block' }}>
                  {a.pet_name}
                </span>
                <span className="small muted">{fmtInt(a.votes)} Open Round votes</span>
              </span>
            </a>
          ))}
      </div>
    </section>
  )
}

export default function Results() {
  const c = useContest()
  const { byId } = useEntries(c.contest?.id)
  useDocumentTitle('Results — Wausau Pilot & Review')

  if (c.phase !== 'complete') {
    return (
      <div className="wrap section">
        <div className="card">
          <h1 style={{ fontSize: 30 }}>No champion yet</h1>
          <p style={{ marginTop: 10 }}>The contest is still under way. Results post here when the Championship closes.</p>
          <a className="btn btn-primary" href="#/bracket">
            See the bracket
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="section" style={{ paddingBottom: 12 }}>
        <p className="kicker">{c.contest.year} results</p>
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)', marginBottom: 18 }}>And the cutest pet in Marathon County is…</h1>
        <Champion c={c} byId={byId} />
      </div>
      <div className="section" style={{ paddingTop: 12 }}>
        <RaisedCounter />
      </div>
      <SideAwards c={c} byId={byId} />
      <section className="section" aria-labelledby="final-title">
        <div className="section-head">
          <h2 id="final-title">The final bracket</h2>
        </div>
        <BracketBoard c={c} byId={byId} />
      </section>
      <section className="section">
        <div className="card sun">
          <h2 style={{ fontSize: 22 }}>Thank you, Marathon County</h2>
          <p style={{ margin: '8px 0 0' }}>
            Every vote pack sent {c.contest.beneficiary_split_pct}% to our partner shelters. See you next year, and in the meantime,{' '}
            <a href="#/shelters">meet some pets who need a home</a>.
          </p>
        </div>
      </section>
    </div>
  )
}

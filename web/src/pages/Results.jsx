import { useContest } from '../components/ContestContext.jsx'
import Confetti from '../components/Confetti.jsx'
import { CrownMark } from '../components/Scoreboard.jsx'
import PetPhoto from '../components/PetPhoto.jsx'
import RaisedCounter from '../components/RaisedCounter.jsx'
import { useBracket, useEntries, useSideAwards } from '../lib/data.js'
import { fmtInt, fmtMoney } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { finalSeq } from '../lib/rounds.js'
import { BracketBoard } from './Bracket.jsx'

// On the sun field, pieces that show against it.
const ON_SUN = ['#1f4b45', '#3a867c', '#ffffff', '#2b655d', '#fcefd0']

// The story of the win in a line, under the name.
function story(seed, size) {
  if (seed === 1) return 'The top seed holds on'
  if (seed > size / 2) return `A No. ${seed} seed takes the crown`
  return `No. ${seed} seed takes the crown`
}

export function Champion({ c, byId }) {
  const { matchups } = useBracket(c.rounds)
  const final = c.rounds.find((r) => r.seq === finalSeq(c.bracketSize))
  const m = final && matchups.find((x) => x.round_id === final.id)
  const champ = m?.winner_entry_id ? byId.get(m.winner_entry_id) : null
  const runnerUp = champ && byId.get(m.entry_a_id === champ.id ? m.entry_b_id : m.entry_a_id)
  if (!champ) return null
  return (
    // A staged reveal: the photo settles and the crown drops onto it, then
    // the name lands a beat later, so "is…" has its answer arrive.
    <section className="champion" aria-labelledby="champ-title">
      <Confetti colors={ON_SUN} />
      <div className="champ-photo">
        <PetPhoto entry={champ} width={800} eager />
        <CrownMark size={64} />
      </div>
      <div className="champ-copy">
        <h2 id="champ-title">{champ.pet_name}</h2>
        <p className="champ-meta">
          {c.contest.year} champion · {story(champ.seed, c.bracketSize)}
        </p>
        <p>
          {champ.pet_name}, of {champ.town}, is the {c.contest.name}
          {runnerUp ? `, beating ${runnerUp.pet_name} in the Championship` : ''}.
          {c.stats ? ` Together, voters raised ${fmtMoney(c.stats.shelter_cents, { whole: true })} for local animal shelters.` : ''}
        </p>
        <a className="btn btn-primary" href={`#/pet/${champ.id}`}>
          See {champ.pet_name}&rsquo;s road to the crown
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
          <h2 id="awards-title">Best in species</h2>
          <p className="section-count">Side awards, from Open Round votes</p>
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

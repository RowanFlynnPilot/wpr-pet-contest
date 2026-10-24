import { memo } from 'react'
import { fmtInt } from '../lib/format.js'
import PetPhoto from './PetPhoto.jsx'
import VoteButton from './VoteButton.jsx'

const SPECIES = { dog: 'Dog', cat: 'Cat', other: 'Other' }

function rankClass(rank, cut) {
  if (rank <= 3) return 'rank-badge top3'
  if (rank <= cut) return 'rank-badge qual'
  return 'rank-badge'
}

// One pet in the grid. The photo and name link to the pet's page; the Vote
// button opens checkout straight from the grid, one tap fewer.
function PetCard({ entry, votes, rank, seed, cut = 16, voteRound, state, eager, adoptable, level = 3, featured = false }) {
  const href = `#/pet/${entry.id}`
  const Name = `h${level}`
  return (
    <article className={`pet-card${state?.out ? ' is-out' : ''}${featured ? ' featured' : ''}`}>
      <a className="pet-card-link" href={href}>
        <div style={{ position: 'relative' }}>
          {rank != null && (
            <span className={rankClass(rank, cut)}>
              <span className="sr-only">Rank </span>#{rank}
            </span>
          )}
          {seed != null && rank == null && <span className="rank-badge qual">Seed {seed}</span>}
          {state?.label && <span className={`state-badge${state.alive ? ' alive' : ''}`}>{state.label}</span>}
          {adoptable && <span className="adopt-flag">Adoptable</span>}
          <PetPhoto entry={entry} width={600} eager={eager} />
        </div>
        <div className="pet-card-body" style={{ paddingBottom: 0 }}>
          <Name className="pet-card-name">{entry.pet_name}</Name>
          <div className="pet-card-meta">
            {entry.town} · {SPECIES[entry.species] || 'Pet'}
          </div>
        </div>
      </a>
      <div className="pet-card-body" style={{ paddingTop: 6 }}>
        <div className="pet-card-foot">
          {votes != null ? (
            <span className="votes">
              <span className="n">{fmtInt(votes)}</span>
              <span className="u">{votes === 1 ? 'vote' : 'votes'}</span>
            </span>
          ) : (
            <span className="votes">
              <span className="u">{state?.note || ''}</span>
            </span>
          )}
          {voteRound && <VoteButton entry={entry} round={voteRound} className="btn btn-ghost btn-sm" />}
        </div>
      </div>
    </article>
  )
}

export default memo(PetCard)

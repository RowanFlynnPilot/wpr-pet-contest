// The contest's permanent record, built from what the desk can read. No owner
// names or emails, ever: the archive outlives the privacy promise, so it must
// not contain anything that promise erases.
import { roundLabel } from './rounds.js'

// Open Round standings: rank, pet, votes, and the seed it earned.
export function openRoundRows(entries, results) {
  const votes = new Map(results.map((r) => [r.entry_id, r.votes]))
  return [...entries]
    .map((e) => ({ entry: e, votes: votes.get(e.id) || 0 }))
    .sort((a, b) => b.votes - a.votes || Date.parse(a.entry.created_at) - Date.parse(b.entry.created_at))
    .map(({ entry, votes: v }, i) => ({
      rank: i + 1,
      pet: entry.pet_name,
      species: entry.species,
      town: entry.town,
      votes: v,
      seed: entry.seed ?? '',
      status: entry.status === 'disqualified' ? 'disqualified' : '',
    }))
}

// Every bracket matchup with both sides' votes and the winner.
export function bracketRows(contest, rounds, matchups, results, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const votes = new Map(results.map((r) => [`${r.round_id}:${r.entry_id}`, r.votes]))
  const seqOf = new Map(rounds.map((r) => [r.id, r.seq]))
  const name = (id) => byId.get(id)?.pet_name ?? ''
  return matchups
    .filter((m) => seqOf.has(m.round_id))
    .sort((a, b) => seqOf.get(a.round_id) - seqOf.get(b.round_id) || a.slot - b.slot)
    .map((m) => ({
      round: roundLabel(seqOf.get(m.round_id), contest.bracket_size),
      matchup: m.slot + 1,
      pet_a: name(m.entry_a_id),
      seed_a: byId.get(m.entry_a_id)?.seed ?? '',
      votes_a: votes.get(`${m.round_id}:${m.entry_a_id}`) || 0,
      pet_b: name(m.entry_b_id),
      seed_b: byId.get(m.entry_b_id)?.seed ?? '',
      votes_b: votes.get(`${m.round_id}:${m.entry_b_id}`) || 0,
      winner: m.winner_entry_id ? name(m.winner_entry_id) : '',
    }))
}

export function champion(rounds, matchups, entries) {
  const last = [...rounds].sort((a, b) => b.seq - a.seq)[0]
  const final = last && matchups.find((m) => m.round_id === last.id && m.winner_entry_id)
  return final ? entries.find((e) => e.id === final.winner_entry_id)?.pet_name ?? null : null
}

export function summary({ contest, rounds, matchups, entries, sideAwards, payout, shelterPayouts, packs }) {
  return {
    contest: {
      year: contest.year,
      name: contest.name,
      status: contest.status,
      shelter_share_pct: contest.beneficiary_split_pct,
      bracket_size: contest.bracket_size,
      submissions: { opened: contest.submissions_open_at, closed: contest.submissions_close_at },
    },
    champion: champion(rounds, matchups, entries),
    side_awards: sideAwards.map((a) => ({ award: `Best ${a.species[0].toUpperCase()}${a.species.slice(1)}`, pet: a.pet_name, votes: a.votes })),
    entries: {
      approved: entries.filter((e) => e.status === 'approved').length,
      disqualified: entries.filter((e) => e.status === 'disqualified').length,
    },
    rounds: [...rounds]
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({ name: roundLabel(r.seq, contest.bracket_size), opened: r.opens_at, closed: r.closes_at, finalized: r.resolved_at })),
    money: payout
      ? {
          sales_cents: payout.sales_cents,
          refunded_cents: payout.refunded_cents,
          disputed_cents: payout.disputed_cents,
          net_cents: payout.net_cents,
          shelter_pool_cents: payout.shelter_pool_cents,
          purchases: payout.purchases,
        }
      : null,
    shelters: shelterPayouts.map((s) => ({ name: s.name, weight: s.payout_weight, amount_cents: s.amount_cents })),
    vote_packs: packs.map((p) => ({ label: p.label, votes: p.votes, cents: p.cents })),
    generated_at: new Date().toISOString(),
  }
}

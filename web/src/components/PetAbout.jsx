// Who the pet is, before what it needs: the owner's caption and the "Get to
// know" answers (0026), as chips that read as phrases ("aka Biscuit Boy",
// "Loves the squeaky hedgehog"). First thing under the photo on the pet page,
// and the live preview on the entry form. The labels a chip drops visually
// stay for screen readers.
export const PROFILE = [
  { key: 'profile_nickname', emoji: '🏷️', label: 'Also answers to', lead: 'aka ' },
  { key: 'profile_favorite', emoji: '🧸', label: 'Favorite thing', lead: 'Loves ' },
  { key: 'profile_trick', emoji: '🎩', label: 'Best trick or quirk', lead: '' },
]

// No "Loves" in front of an answer that already says it ("Loves belly rubs").
const leadFor = (p, value) => (p.lead === 'Loves ' && /^lov(e|es|ing)\b/i.test(value) ? '' : p.lead)
// After "Loves", an opening article, possessive or -ing word drops its
// capital ("Loves the squeaky hedgehog", "Loves stealing socks"), which the
// phone's keyboard put there; anything else (a name, "Cheese") is left as
// typed. A chip with no lead starts the sentence, so it starts with a capital.
const ARTICLE = /^(The|A|An|My|His|Her|Their|Our|Any|All|Every|[A-Z][a-z]{2,}ing)\b/
const bodyFor = (p, value) =>
  leadFor(p, value) ? value.replace(ARTICLE, (w) => w.toLowerCase()) : value.replace(/^\p{Ll}/u, (c) => c.toUpperCase())

export function hasAbout(entry) {
  return Boolean(entry?.caption || PROFILE.some((p) => entry?.[p.key]))
}

export default function PetAbout({ entry, className = '' }) {
  if (!hasAbout(entry)) return null
  const chips = PROFILE.filter((p) => entry[p.key])
  return (
    <div className={`pet-about ${className}`}>
      {entry.caption && <p className="caption">{entry.caption}</p>}
      {chips.length > 0 && (
        <ul className="about-chips" aria-label={`Get to know ${entry.pet_name}`}>
          {chips.map((p) => (
            <li key={p.key} className="about-chip">
              <span className="about-emoji" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="sr-only">{p.label}: </span>
              <span>
                <span aria-hidden="true">{leadFor(p, entry[p.key])}</span>
                {bodyFor(p, entry[p.key])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

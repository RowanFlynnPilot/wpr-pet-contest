import { OTHER_TOWN } from './towns.js'

// Client-side checks for the entry form. The same limits are enforced again
// by submit-entry; these exist so a reader hears about a problem before a
// 3 MB upload, not after.
export const LIMITS = { pet_name: 40, owner_name: 80, town: 60, caption: 280 }
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const EMPTY_ENTRY = {
  pet_name: '',
  species: '',
  town: '',
  town_other: '',
  caption: '',
  owner_name: '',
  owner_email: '',
  newsletter: false,
  rights: false,
  website: '',
}

export function validateEntry(v, photo) {
  const errors = {}
  if (!photo) errors.photo = 'Add a photo of your pet.'
  if (!v.pet_name.trim()) errors.pet_name = "Tell us your pet's name."
  else if (v.pet_name.trim().length > LIMITS.pet_name) errors.pet_name = `Keep it to ${LIMITS.pet_name} characters.`
  if (!v.species) errors.species = 'Pick dog, cat or other.'
  const town = v.town === OTHER_TOWN ? v.town_other.trim() : v.town
  if (!town) errors.town = v.town === OTHER_TOWN ? 'Type your town.' : 'Pick your town.'
  else if (town.length > LIMITS.town) errors.town = `Keep it to ${LIMITS.town} characters.`
  if (v.caption.length > LIMITS.caption) errors.caption = `Keep it to ${LIMITS.caption} characters.`
  if (!v.owner_name.trim()) errors.owner_name = 'Add your name. It is never published.'
  else if (v.owner_name.trim().length > LIMITS.owner_name) errors.owner_name = `Keep it to ${LIMITS.owner_name} characters.`
  if (!EMAIL_RE.test(v.owner_email.trim())) errors.owner_email = 'Enter an email address we can reach you at.'
  if (!v.rights) errors.rights = 'Please accept the photo release to enter.'
  return errors
}


// The card-to-hero morph (lib/router.js runs the view transition). Exactly
// one element may carry a view-transition-name at a time, so a tap on a pet
// card first takes the name from wherever it is (the hero of the pet page
// being left, another card) and gives it to this card's photo. The pet
// page's hero carries it as it renders.
export function nameForMorph(target) {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return
  const photo = target?.querySelector?.('.photo')
  if (!photo) return
  document.querySelectorAll('.vt-photo').forEach((el) => el.classList.remove('vt-photo'))
  photo.classList.add('vt-photo')
}

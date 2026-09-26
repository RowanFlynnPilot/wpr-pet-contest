// Share links. Readers land on the WordPress page (publicUrl), which forwards
// its hash into the iframe. Facebook and X get the per-pet share page instead,
// because a crawler cannot run the app to find the pet's photo.

const stripHash = (u) => String(u || '').replace(/#.*$/, '')

export function petPublicUrl(publicUrl, id) {
  return `${stripHash(publicUrl)}#/pet/${id}`
}

export function petSharePageUrl(appBase, id) {
  const base = stripHash(appBase).replace(/\/?$/, '/')
  return `${base}p/${id}/`
}

export function shareText(petName, contestName = 'Cutest Pet in Marathon County') {
  return `Vote for ${petName} in the ${contestName} contest! Every vote pack helps local animal shelters.`
}

export function shareLinks({ url, crawlerUrl = url, text, subject }) {
  const u = encodeURIComponent
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u(crawlerUrl)}`,
    x: `https://x.com/intent/tweet?text=${u(text)}&url=${u(crawlerUrl)}`,
    // "?&body=" is the form both iOS and Android Messages accept.
    sms: `sms:?&body=${u(`${text} ${url}`)}`,
    email: `mailto:?subject=${u(subject || text)}&body=${u(`${text}\n\n${url}`)}`,
  }
}

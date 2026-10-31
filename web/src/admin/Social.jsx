import { lazy, Suspense } from 'react'

// The drawing code loads only when someone opens this tab.
const SocialDesk = lazy(() => import('./SocialDesk.jsx'))

export default function Social() {
  return (
    <Suspense fallback={<p className="muted">Loading the graphics desk…</p>}>
      <SocialDesk />
    </Suspense>
  )
}

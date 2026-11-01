// What makes a photo win votes: on the entry form, and on the home page before
// a contest is announced, when finding the photo is the one thing to do.
export default function PhotoTips({ title = 'Photos that win votes' }) {
  return (
    <div className="card sun">
      <h2 style={{ fontSize: 21, marginBottom: 8 }}>{title}</h2>
      <ul className="tips">
        <li>Get down to your pet&rsquo;s eye level.</li>
        <li>Daylight by a window beats a flash.</li>
        <li>One pet, filling most of the frame.</li>
        <li>No people&rsquo;s faces, text or filters, please.</li>
      </ul>
    </div>
  )
}

// The shelters' goal meter: how far along, and whether it is met. Never
// rounds a short total up to "reached".
export function goalProgress(cents, goalCents) {
  const goal = Number(goalCents) || 0
  if (goal <= 0) return null
  const raised = Math.max(0, Number(cents) || 0)
  return {
    goal,
    raised,
    reached: raised >= goal,
    pct: Math.min(100, Math.floor((raised / goal) * 100)),
    remaining: Math.max(0, goal - raised),
  }
}

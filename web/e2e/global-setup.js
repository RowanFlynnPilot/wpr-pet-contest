// A throwaway admin for the run. The password is random and never written
// anywhere but this process's environment, which Playwright hands the tests.
import { serviceRest, stackEnv } from './stack.js'

export default async function globalSetup() {
  const stack = stackEnv()
  const rest = serviceRest(stack)
  const email = `e2e-${Date.now()}@example.test`
  const password = `e2e-${crypto.randomUUID()}`

  const r = await fetch(`${stack.API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: stack.SERVICE_ROLE_KEY, Authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const user = await r.json()
  if (!user.id) throw new Error(`could not create the e2e admin: ${JSON.stringify(user)}`)
  await rest('admins', { method: 'POST', body: JSON.stringify({ user_id: user.id }) })
  // Counters from earlier runs against the same database.
  await rest('rate_limits?hits=gte.0', { method: 'DELETE' })

  process.env.E2E_ADMIN_EMAIL = email
  process.env.E2E_ADMIN_PASSWORD = password
}

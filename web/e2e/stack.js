// Connection details for the local Supabase stack, read from the CLI so the
// browser tests run unchanged on a laptop and in CI.
import { execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

export function stackEnv() {
  if (process.env.API_URL && process.env.SECRET_KEY) return process.env
  const out = execSync('supabase status -o env', { cwd: ROOT, encoding: 'utf8' })
  const env = {}
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

// The same placeholder settings the integration suite serves functions with.
export function functionsEnv() {
  const env = {}
  const text = readFileSync(new URL('../../supabase/tests/integration/functions.env', import.meta.url), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

export const fixturePath = (name) => fileURLToPath(new URL(`../../supabase/tests/fixtures/${name}`, import.meta.url))

export function serviceRest(stack) {
  const headers = { apikey: stack.SECRET_KEY, Authorization: `Bearer ${stack.SECRET_KEY}` }
  return async (path, init = {}) => {
    const r = await fetch(`${stack.API_URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
    })
    const text = await r.text()
    return { status: r.status, body: text ? JSON.parse(text) : null }
  }
}

// What Stripe would send: a payment_intent.succeeded event, properly signed.
export async function sendPaidWebhook(stack, secret, paymentIntentId, roundId) {
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID().replaceAll('-', '')}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: paymentIntentId, object: 'payment_intent', metadata: { kind: 'vote_pack', round_id: roundId } } },
  })
  const t = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  const r = await fetch(`${stack.API_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
    body: payload,
  })
  return r.status
}

// Width and height from a JPEG's SOF marker.
export function jpegSize(buf) {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

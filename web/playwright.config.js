import { defineConfig } from '@playwright/test'
import { stackEnv } from './e2e/stack.js'

// Browser tests against the local Supabase stack, in contest order: a reader
// enters, staff moderate and open voting, a paid vote shows up live.
//
//   supabase start && supabase db reset
//   supabase functions serve --env-file supabase/tests/integration/functions.env
//   npm --prefix web run e2e
//
// Locally this drives the installed Edge (no browser download); set
// PW_CHANNEL=chrome for Chrome. CI uses Playwright's bundled Chromium.
const stack = stackEnv()
const PORT = 5174

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.CI ? undefined : (process.env.PW_CHANNEL || 'msedge'),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: stack.API_URL,
      VITE_SUPABASE_ANON_KEY: stack.PUBLISHABLE_KEY || stack.ANON_KEY,
      VITE_STRIPE_PUBLISHABLE_KEY: '',
      VITE_PUBLIC_URL: `http://127.0.0.1:${PORT}/`,
      VITE_IMAGE_TRANSFORMS: 'false',
    },
  },
})

import { defineConfig } from '@playwright/test'

// Accessibility and phone-layout audit: every public page and the article
// widget, in every phase of the contest, at phone size. Runs against the mock
// API (scripts/mock-api.mjs), so it needs no Supabase stack and no Docker.
//
//   npm --prefix web run audit
//
// Locally this drives the installed Edge; CI uses Playwright's Chromium.
// Off the beaten path: 8788 and up are Wrangler's dev ports, often busy on a
// newsroom laptop.
const MOCK_PORT = 18791
const PORT = 5176

export default defineConfig({
  testDir: 'audit',
  // The mock serves one phase at a time to everyone, so tests run in order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.CI ? undefined : process.env.PW_CHANNEL || 'msedge',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  webServer: [
    {
      command: 'node scripts/mock-api.mjs',
      url: `http://127.0.0.1:${MOCK_PORT}/rest/v1/contests`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(MOCK_PORT) },
    },
    {
      command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
        VITE_STRIPE_PUBLISHABLE_KEY: '',
        VITE_PUBLIC_URL: '',
        VITE_IMAGE_TRANSFORMS: 'false',
      },
    },
  ],
})

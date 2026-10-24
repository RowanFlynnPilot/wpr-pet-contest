import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_SITE = 'https://rowanflynnpilot.github.io/wpr-pet-contest/'

// Social tags need absolute URLs, and the host differs between the GitHub
// Pages build and a fork. index.html carries %SITE_URL% placeholders.
function siteUrl(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  const repo = process.env.GITHUB_REPOSITORY
  const fromRepo = repo ? `https://${repo.split('/')[0].toLowerCase()}.github.io/${repo.split('/')[1]}/` : null
  return (env.VITE_SITE_URL || fromRepo || DEFAULT_SITE).replace(/\/?$/, '/')
}

export default defineConfig(({ mode }) => ({
  // './' so the build works under any path: GitHub Pages serves it from
  // /wpr-pet-contest/, local preview from /.
  base: './',
  plugins: [
    react(),
    {
      name: 'wpr-site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl(mode)),
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // The article widget: its own page so an embed in a story stays small.
        widget: fileURLToPath(new URL('./widget.html', import.meta.url)),
      },
    },
  },
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
}))

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
    {
      // The demo build (scripts/build-demo.mjs): the backend runs inside the
      // browser, loaded ahead of the app so it owns fetch before the client
      // is built. A normal build never includes it.
      name: 'wpr-demo-shim',
      transformIndexHtml: {
        // Before Vite rewrites the entry tag, so the shim becomes an entry too.
        order: 'pre',
        // Vite folds a page's module scripts into one entry, in order, so the
        // shim's fetch patch is in place before the app's client is built.
        handler: (html) =>
          mode === 'demo'
            ? html.replace(
                '<script type="module" src="/src/',
                // The newsroom choice has to be on <html> before any module runs
                // (shared chunks evaluate ahead of the shim), so a classic
                // script sets it first; the shim does the rest.
                '<script>try{window.WPR_DEMO=1;var s=JSON.parse(localStorage.getItem("wpr-demo")||"{}");var q=new URLSearchParams(location.search);var n=q.get("newsroom")||s.newsroom;if(n)document.documentElement.dataset.newsroom=n;var m=q.get("mode")||s.mode;if(m==="light"||m==="dark")document.documentElement.dataset.mode=m}catch(e){}</script>\n' +
                  '    <script type="module" src="/src/demo/shim.js"></script>\n    <script type="module" src="/src/',
              )
            : html,
      },
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

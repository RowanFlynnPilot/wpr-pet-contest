import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Every public page and the widget, in each phase the mock can serve, at
// phone size: no WCAG 2.2 A/AA or best-practice problems axe can find (target
// sizes, landmarks and heading order included), and no sideways scrolling
// (the WordPress iframe clips anything wider than the phone).
const MOCK = 'http://127.0.0.1:18791'
const PHASES = ['submissions', 'open', 'bracket', 'complete']
const ROUTES = ['', 'gallery', 'pet', 'bracket', 'enter', 'rules', 'shelters', 'results', 'sponsors']
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

let petId = null

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
}

async function audit(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n    ')}`)
  expect(report, report.join('\n')).toEqual([])
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(width.scroll, 'page scrolls sideways at phone width').toBeLessThanOrEqual(width.client)
}

for (const phase of PHASES) {
  test.describe(phase, () => {
    test.beforeAll(async ({ request }) => {
      await request.get(`${MOCK}/__phase?set=${phase}`)
      const rows = await (await request.get(`${MOCK}/rest/v1/entries?select=id&status=eq.approved&order=created_at&limit=1`)).json()
      petId = rows[0]?.id
    })

    for (const route of ROUTES) {
      test(`#/${route}`, async ({ page }) => {
        await page.goto(`/#/${route === 'pet' ? `pet/${petId}` : route}`)
        await settle(page)
        await audit(page)
      })
    }

    test('article widget', async ({ page }) => {
      await page.goto('/widget.html')
      await settle(page)
      await audit(page)
    })

    if (phase === 'open') {
      test('checkout dialog', async ({ page }) => {
        await page.goto(`/#/pet/${petId}`)
        await settle(page)
        await page.getByRole('button', { name: /^Vote for/ }).first().click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await audit(page)
      })

      // The owner's panel: goal, ready-made posts, the owner-link count.
      for (const scheme of ['light', 'dark']) {
        test(`owner panel (${scheme})`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: scheme })
          await page.goto(`/#/pet/${petId}?owner=11111111-2222-3333-4444-555555555555`)
          await settle(page)
          await expect(page.getByRole('heading', { name: 'Ready-made posts' })).toBeVisible()
          await page.getByRole('button', { name: 'Instagram' }).click()
          await expect(page.getByRole('textbox', { name: /Post for Instagram/ })).toHaveValue(/Link in bio/)
          await audit(page)
        })
      }
    }
  })
}

test('staff sign-in', async ({ page }) => {
  await page.goto('/#/admin')
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await audit(page)
})

// Dark mode: the same bar, on the dark paper. The five routes here carry
// every surface (the arena, a pet page, the bracket, a form, long text).
test.describe('dark mode', () => {
  test.beforeAll(async ({ request }) => {
    await request.get(`${MOCK}/__phase?set=bracket`)
    const rows = await (await request.get(`${MOCK}/rest/v1/entries?select=id&status=eq.approved&order=created_at&limit=1`)).json()
    petId = rows[0]?.id
  })
  for (const route of ['', 'pet', 'bracket', 'enter', 'rules']) {
    test(`#/${route} in the dark`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.goto(`/#/${route === 'pet' ? `pet/${petId}` : route}`)
      await settle(page)
      await audit(page)
    })
  }
})

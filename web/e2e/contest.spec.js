// One contest, front to back, the way people will actually use it. Serial:
// each step depends on the one before (the entry made in step one is the pet
// that receives a vote in step three).
import { expect, test } from '@playwright/test'
import { fixturePath, functionsEnv, jpegSize, sendPaidWebhook, serviceRest, stackEnv } from './stack.js'

test.describe.configure({ mode: 'serial' })

const stack = stackEnv()
const rest = serviceRest(stack)
const WHSEC = functionsEnv().STRIPE_WEBHOOK_SECRET
const ROUND1 = '00000000-0000-0000-0000-00000000d001'
const PET = 'Playwright Pup'

async function signIn(page, route) {
  await page.goto(route)
  await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL)
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD)
  await page.getByLabel('Password').press('Enter')
  await expect(page.getByRole('navigation', { name: 'Desk sections' })).toBeVisible()
}

const object = async (path) => {
  const r = await fetch(`${stack.API_URL}/storage/v1/object/public/pets/${path}`)
  return Buffer.from(await r.arrayBuffer())
}

test('a reader enters a pet from a phone photo', async ({ page }) => {
  await page.goto('/#/enter')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // 400×300 with EXIF orientation 6 (a portrait phone shot) and GPS.
  await page.locator('input[type=file]').first().setInputFiles(fixturePath('gps.jpg'))
  await page.getByLabel("Pet's name").fill(PET)
  await page.locator('.chips label', { hasText: 'Dog' }).click()
  await page.locator('select#town').selectOption('Wausau')
  await page.getByLabel('Your name').fill('E2E Tester')
  await page.getByLabel('Your email').fill('e2e@example.com')
  await page.getByLabel('I agree to the photo release below.').check()
  await page.getByRole('button', { name: 'Enter my pet' }).click()

  await expect(page.getByRole('heading', { name: `${PET} is entered!` })).toBeVisible()

  const [row] = (await rest(`entries?select=status,photo_path,thumb_path&pet_name=eq.${encodeURIComponent(PET)}`)).body
  expect(row.status).toBe('pending')
  expect(row.thumb_path, 'the browser made and sent a thumbnail').toMatch(/\.thumb\.jpg$/)

  const photo = await object(row.photo_path)
  const thumb = await object(row.thumb_path)
  for (const bytes of [photo, thumb]) {
    expect(bytes.includes('SECRET-LOCATION-MARKER'), 'no EXIF text survives').toBe(false)
    expect(bytes.includes('IntegrationCam')).toBe(false)
  }
  // The canvas baked the rotation into the pixels: portrait now, not landscape.
  expect(jpegSize(photo)).toEqual({ width: 300, height: 400 })
})

test('staff work the moderation queue and open voting', async ({ page }) => {
  await signIn(page, '/#/admin/moderation')

  // Approve everything waiting, our new entry included: one at a time, each
  // confirmed by the pending count dropping.
  const pending = page.getByRole('heading', { name: /^Pending/ })
  const clear = page.getByText('The queue is clear. Nothing waiting.')
  await expect(pending).toBeVisible()
  await expect(pending).not.toHaveText(/…/)
  const approve = page.getByRole('button', { name: /^Approve/ }).first()
  for (let i = 0; i < 10 && !(await clear.isVisible()); i++) {
    const before = await pending.innerText()
    await approve.click()
    await expect(pending).not.toHaveText(before)
    // The count and the list update separately. Let the list settle before
    // asking whether anything is left, or the next click finds a row that
    // is about to vanish.
    await expect(clear.or(approve)).toBeVisible()
  }
  await expect(clear).toBeVisible()

  await page.goto('/#/admin/rounds')
  await page.getByRole('button', { name: 'Open…' }).click()
  const confirm = page.getByRole('dialog')
  await confirm.getByLabel('Type OPEN to confirm').fill('OPEN')
  await confirm.locator('button[type=submit]').click()
  await expect(page.getByText('voting', { exact: true })).toBeVisible()
})

test('a paid vote appears on the pet page without a reload', async ({ page }) => {
  const [pet] = (await rest(`entries?select=id&pet_name=eq.${encodeURIComponent(PET)}`)).body
  await page.goto(`/#/pet/${pet.id}`)
  await expect(page.getByRole('heading', { name: PET })).toBeVisible()

  // Stripe's side, simulated: a pending vote from checkout, then the signed
  // success event. The page must pick it up by polling.
  await rest('votes', {
    method: 'POST',
    body: JSON.stringify({
      round_id: ROUND1, entry_id: pet.id, quantity: 25, amount_cents: 2000,
      buyer_email: 'e2e-buyer@example.com', stripe_payment_intent_id: 'pi_e2e_1', pack_slug: 'fan',
    }),
  })
  expect(await sendPaidWebhook(stack, WHSEC, 'pi_e2e_1', ROUND1)).toBe(200)

  await expect(page.locator('main')).toContainText(/25\s+votes/, { timeout: 45_000 })
})

test('an owner can make share images in every format', async ({ page }, testInfo) => {
  const [pet] = (await rest(`entries?select=id&pet_name=eq.${encodeURIComponent(PET)}`)).body
  await page.goto(`/#/pet/${pet.id}`)
  await page.getByRole('button', { name: 'Make a share image' }).click()

  const sizes = { Story: [1080, 1920], Square: [1080, 1080], Flyer: [1275, 1650] }
  for (const [label, [width, height]] of Object.entries(sizes)) {
    await page.getByRole('group', { name: 'Image size' }).getByRole('button', { name: label }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PNG' }).click()
    const file = testInfo.outputPath(`${label.toLowerCase()}.png`)
    await (await download).saveAs(file)
    const png = (await import('node:fs')).readFileSync(file)
    // PNG header: width and height are the first two fields of IHDR.
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${label} is exactly ${width}×${height}`).toEqual([width, height])
  }
})

test('checkout offers the database packs and never calls it a donation', async ({ page }) => {
  const [pet] = (await rest(`entries?select=id&pet_name=eq.${encodeURIComponent(PET)}`)).body
  await page.goto(`/#/pet/${pet.id}`)
  await page.getByRole('button', { name: `Vote for ${PET}` }).first().click()

  const dialog = page.getByRole('dialog')
  for (const price of ['$5', '$20', '$50', '$100', '$250']) {
    await expect(dialog.getByText(price, { exact: true })).toBeVisible()
  }
  // Legal, not style: buying votes is not a tax-deductible donation. The
  // disclaimer must be there, and "donation" may only appear negated.
  const text = (await dialog.innerText()).toLowerCase().replace(/[’']/g, "'")
  expect(text).toContain('not tax-deductible')
  expect(text.replace(/(isn't|not)( a| tax-deductible)? donations?/g, '')).not.toMatch(/donat/)

  // The "plays again" box reaches the checkout call. The placeholder Stripe
  // key means the server answers with a readable error and nothing is parked.
  await dialog.getByLabel(/email for your receipt/i).fill('e2e-buyer@example.com')
  await dialog.getByLabel(/plays again/i).check()
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/functions/v1/create-checkout')),
    dialog.getByRole('button', { name: /^Continue/ }).click(),
  ])
  expect(request.postDataJSON()).toMatchObject({ pack_slug: 'fan', plays_again_opt_in: true, newsletter_opt_in: false })
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('staff read the payout statement and set up next year from the desk', async ({ page }) => {
  await signIn(page, '/#/admin/wrapup')
  // The one $20 pack bought earlier, 30% to the shelters.
  const statement = page.locator('.print-area')
  await expect(statement).toContainText('Shelter payout statement')
  await expect(statement).toContainText('PRELIMINARY')
  await expect(statement.locator('tr', { hasText: 'Net vote pack sales' })).toContainText('$20.00')
  await expect(statement.locator('tr', { hasText: 'Shelter share (30%)' })).toContainText('$6.00')

  // The archive: three files, standings by pet name, and no owner details.
  const files = []
  page.on('download', (d) => files.push(d))
  await page.getByRole('button', { name: 'Download archive' }).click()
  await expect.poll(() => files.length).toBe(3)
  const names = files.map((d) => d.suggestedFilename()).sort()
  expect(names).toEqual(['pet-contest-2026-bracket.csv', 'pet-contest-2026-open-round.csv', 'pet-contest-2026-summary.json'])
  const standings = (await import('node:fs')).readFileSync(await files.find((d) => d.suggestedFilename().endsWith('open-round.csv')).path(), 'utf8')
  expect(standings).toContain(PET)
  expect(standings).not.toMatch(/@example\.com/)

  await page.goto('/#/admin/setup')
  await page.getByRole('button', { name: /Start next year/ }).click()
  const form = page.locator('form', { hasText: 'Start the 2027 contest' })
  await form.getByLabel('Submissions open').fill('2027-10-01T09:00')
  await form.getByLabel('Submissions close').fill('2027-10-08T21:00')
  await form.getByRole('button', { name: 'Create draft' }).click()
  await expect(page.getByText('The 2027 contest is set up as a draft.')).toBeVisible()

  // The new draft is selected, carries the copied packs, and can be deleted.
  await expect(page.getByRole('heading', { name: /2027 setup/ })).toBeVisible()
  await expect(page.getByText('5 active vote packs')).toBeVisible()
  await page.getByRole('button', { name: /Delete this draft/ }).click()
  await page.getByRole('dialog').getByLabel('Type DELETE to confirm').fill('DELETE')
  await page.getByRole('dialog').locator('button[type=submit]').click()
  await expect(page.getByText('The 2027 draft was deleted.')).toBeVisible()
})

test('the public pages render without script errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    // Seed entries point at photos that do not exist locally; a missing image
    // is not a script error.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  for (const route of ['/#/', '/#/gallery', '/#/bracket', '/#/rules', '/#/shelters', '/#/sponsors']) {
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForTimeout(500)
  }
  expect(errors).toEqual([])
})

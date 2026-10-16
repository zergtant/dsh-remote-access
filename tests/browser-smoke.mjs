import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const source = process.env.DSH_SOURCE ?? '/home/tant/deepseek-harness'
const testHome = process.env.DSH_HOME
if (!testHome) throw new Error('Set DSH_HOME to the isolated running test profile')
const store = join(source, 'node_modules/.pnpm')
const pkg = readdirSync(store).find(name => /^playwright@/.test(name))
if (!pkg) throw new Error('Install playwright in the test harness first')
const { chromium } = await import(pathToFileURL(join(store, pkg, 'node_modules/playwright/index.mjs')))
let url
await eventually(async () => {
  const log = readFileSync(join(testHome, 'compat-server.log'), 'utf8')
  url = log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/)?.[1]
  assert.ok(url, 'No authenticated test URL found')
})
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP dsh-remote.test 127.0.0.1', '--no-proxy-server'] })
const password = randomBytes(24).toString('hex')
async function eventually(check) {
  let failure
  for (let i = 0; i < 80; i++) {
    try { await check(); return } catch (error) { failure = error }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw failure
}
async function openSettings(page) {
  await page.waitForTimeout(2000)
  const welcome = page.getByRole('button', { name: 'Continue', exact: true })
  if (await welcome.isVisible()) await welcome.click()
  const later = page.getByRole('button', { name: 'Configure later', exact: true })
  await page.waitForTimeout(500)
  if (await later.isVisible()) await later.click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.waitForTimeout(500)
  if (await welcome.isVisible()) await welcome.click()
  await page.getByRole('button', { name: 'Remote Access', exact: true }).click()
  await page.locator('.ra-page').waitFor()
}
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message))
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()) })
  await page.goto(url)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
  await openSettings(page)
  const panel = page.locator('.ra-page')
  if (await panel.locator('.ra-stop').isVisible()) {
    await panel.locator('.ra-stop').click()
    await panel.locator('.ra-start').waitFor()
  }
  await panel.getByLabel('Port', { exact: true }).fill('13081')
  await panel.locator('select').selectOption('127.0.0.1')
  await panel.getByLabel('Username', { exact: true }).fill('compat-test')
  await panel.locator('input[type=password]').fill(password)
  await panel.locator('.ra-save').click()
  await eventually(async () => {
    assert.equal(await panel.locator('.ra-error').count(), 0)
    assert.equal(await panel.locator('.ra-state-ok').count(), 1)
    assert.match(readFileSync(join(testHome, 'settings.yaml'), 'utf8'), /port: 13081/)
  })
  console.log('PASS: settings and credential saved through browser')
  await panel.locator('.ra-start').click()
  const edge = 'https://127.0.0.1:13081'
  await eventually(async () => assert.equal((await context.request.get(edge + '/login')).status(), 200))
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  assert.equal((await anonymous.request.get(edge + '/api/test', { maxRedirects: 0 })).status(), 401)
  assert.equal((await anonymous.request.post(edge + '/login', { form: { username: 'compat-test', password: 'wrong' }, maxRedirects: 0 })).status(), 401)
  console.log('PASS: TLS listener and unauthenticated/wrong-password rejection')
  const remote = await anonymous.newPage()
  await remote.goto('https://dsh-remote.test:13081/login')
  await remote.locator('input[name=username]').fill('compat-test')
  await remote.locator('input[name=password]').fill(password)
  await remote.locator('button[type=submit]').click()
  await remote.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 20000 })
  assert.equal(await remote.evaluate(() => globalThis.__DSH_REMOTE_ACCESS__), true)
  assert.notEqual(await remote.evaluate(() => globalThis.__DSH_REMOTE_ACCESS_BOOTSTRAP_FAILED__), 1)
  await openSettings(remote)
  assert.match(await remote.locator('.ra-page').innerText(), /Read-only while remote/)
  assert.equal(await remote.locator('.ra-page').getByLabel('Port', { exact: true }).inputValue(), '13081')
  console.log('PASS: remote-hostname login, authenticated GUI and settings readback')
  await panel.getByLabel('Port', { exact: true }).fill('13082')
  await panel.getByLabel('Username', { exact: true }).fill('compat-migrated')
  await panel.locator('.ra-save').click()
  await eventually(async () => assert.equal((await context.request.get('https://127.0.0.1:13082/login')).status(), 200))
  console.log('PASS: live multi-field settings update and port migration')
  await panel.locator('.ra-stop').click()
  await eventually(async () => assert.match(readFileSync(join(testHome, 'settings.yaml'), 'utf8'), /enabled: false/))
  await page.screenshot({ path: join(testHome, 'browser-smoke.png') })
  console.log('PASS: stop saved; test edge disabled')
} finally {
  await browser.close()
}

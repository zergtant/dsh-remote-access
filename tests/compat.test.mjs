/**
 * Compatibility guards for the dsh 0.2.x plugin contracts this package depends
 * on. These are static checks — they read the shipped artifacts and the
 * manifest, so they run without a dsh installation or a browser.
 *
 * Run: npm test   (node --test tests/compat.test.mjs)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const manifest = JSON.parse(read('package.json'))
const host = read('lib/index.js')
const hostSource = read('src/index.js')
const client = read('lib/client.js')
const clientSource = read('src/client.tsx')

test('the manifest keeps the bundle and client-bundle contracts', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.exports['.'], './lib/index.js')
  // 0.2.x resolves the client half from this subpath; a missing bundle is a
  // loud load failure on the host side, not a silently missing page.
  assert.ok(read('cordis.patch.yml').includes("name: 'dsh-remote-access'"))
})

test('the dsh peer range admits the 0.2.x runtime', () => {
  const range = manifest.peerDependencies['@deepseek-ai/dsh-credentials']
  assert.match(range, /\^0\.2\./)
  assert.ok(!/\^0\.1\./.test(range), 'the removed 0.1.x seam is no longer a valid target')
})

test('the patch row id, the settings namespace, and the client binding agree', () => {
  // 0.2.x names a settings namespace after the profile entry id, so the row id
  // in the bundle patch is load-bearing: a rename would silently hide the card.
  const rowId = /- insert:\s*\n\s*- id:\s*(\S+)/.exec(read('cordis.patch.yml'))?.[1]
  const hostEntryId = /export const ENTRY_ID = NS/.test(host) ? /const NS = '([^']+)'/.exec(host)?.[1] : undefined
  const clientNs = /const NS = '([^']+)'/.exec(clientSource)?.[1]
  assert.equal(rowId, 'remote-access')
  assert.equal(hostEntryId, rowId)
  assert.equal(clientNs, rowId)
})

test('the host half uses the 0.2.x settings contract', () => {
  // A profile entry's Config IS the settings namespace in 0.2.x: editable
  // fields must be volatile, and no section is registered by hand.
  for (const field of ['enabled', 'tls', 'port', 'host', 'username']) {
    assert.match(host, new RegExp(`${field}: [^\\n]*\\.volatile\\(\\)`), `${field} must be volatile`)
  }
  assert.ok(!/\.installSection\s*\(/.test(host), 'settings.installSection was removed in 0.2.x')
  assert.ok(host.includes('configure({ auto: false }'), 'the browser half owns the page, so auto-generation is off')
  // Volatile-only writes commit in place and announce themselves on that event.
  assert.ok(host.includes("ctx.on('loader/volatile-update'"), 'volatile writes drive the edge re-sync')
})

test('the host half claims the browser transport instead of patching a module', () => {
  // 0.2.x derives the settings persistence mode from
  // `connection.isLoopback`, which the client carrier computes from
  // `globalThis.__DSH_TRANSPORT__.ownsHost` before installing its service.
  assert.ok(host.includes('__DSH_TRANSPORT__'))
  assert.ok(host.includes('ownsHost:true'))
  assert.ok(!host.includes('__ModuleLoader__'), 'the 0.1.x loader trap is gone')
  // The same script marks the document as edge-served; that marker is the
  // browser half's only local/remote discriminator.
  assert.ok(host.includes('__DSH_REMOTE_ACCESS_EDGE__=true'))
})

test('the local/remote split rides the edge marker, not the page hostname', () => {
  // A hostname cannot answer "local or remote": the desktop shell serves its
  // local window from `dsh-app://app/`, the edge is remote under any authority.
  assert.ok(client.includes('__DSH_REMOTE_ACCESS_EDGE__'), 'the edge marker drives the split')
  assert.ok(!clientSource.includes('isLoopbackPage'), 'the hostname heuristic is gone')
  assert.ok(!clientSource.includes('location?.hostname'), 'no hostname probing remains')
  assert.ok(clientSource.includes('const remote = isEdgePage()'))
})

test('the browser half uses configForms and the Remote credentials namespace', () => {
  assert.ok(client.includes('configForms'), 'the shared per-entry form replaced settingsScope')
  assert.ok(client.includes('whileServed'), 'the section follows the served namespace')
  assert.ok(!client.includes('settingsScope'), 'ctx.settingsScope was removed in 0.2.x')
  assert.ok(client.includes('remote.credentials'))
  // The section must not hold the whole client entry back when the settings
  // domain is absent; the 401 redirect has to install regardless.
  assert.ok(!/inject = \[[^\]]*'configForms'/.test(clientSource), 'configForms is an optional wait')
})

test('the built bundles are in sync with their sources', () => {
  assert.equal(host, hostSource, 'run `npm run build:host` after editing src/index.js')
  assert.ok(client.includes('window.__ModuleLoader__.load'), 'the client bundle keeps the module-loader wrapper')
  assert.match(client, /id: "dsh-remote-access"/)
  assert.ok(client.includes('__DSH_REMOTE_ACCESS__') === false, 'the trust bootstrap stays in the host half')
})

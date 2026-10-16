/**
 * dsh remote access — host half (dsh 0.2.x).
 *
 * Owns a TLS edge entry (self-signed certificate) on its own listener. The
 * main dsh web server stays bound to loopback; every request the edge accepts
 * is authenticated (login page + session cookie) and then re-issued to
 * 127.0.0.1 with a loopback Host so the host's browser trust fence accepts it
 * as a local client. The login credential is a credential reference resolved
 * per login attempt; the rest of the card fields ARE this plugin entry's own
 * Config, which dsh 0.2 exposes as the `remote-access` settings namespace.
 *
 * 0.2.x contract notes:
 * - `settings.installSection` is gone. A profile entry's Config is the settings
 *   namespace (keyed by the entry id, here `remote-access`), and the fields a
 *   settings page may edit live are declared `.volatile()`. Volatile values
 *   arrive as stable `{ get() }` references and are committed in place on an
 *   accepted write, which surfaces here as `loader/volatile-update` — no
 *   remount, so the edge is re-synced instead of rebuilt from scratch.
 * - `settings.configure({ auto: false }, ctx.fiber)` keeps the service from
 *   also auto-generating a page for this entry; the browser half owns the page.
 */

import { createHash, randomBytes, timingSafeEqual, X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'

/** Cordis service name of this function plugin. */
export const name = 'remote-access'

/** Required services. */
export const inject = ['webServer', 'credentials', 'connection']

/**
 * Settings namespace of the remote-access card. In 0.2.x this is exactly this
 * entry's id in the profile patch, which is also what the browser half binds
 * through `ctx.configForms.get(...)` — `settings.configure` needs no name.
 */
const NS = 'remote-access'

/** Loader row id this plugin must be mounted under for NS to name its config. */
export const ENTRY_ID = NS

/** Credential reference holding the login password (POSIX-style name). */
const PASSWORD_REF = credentialRef('DSH_REMOTE_ACCESS_PASSWORD')

/** Session cookie name. */
const SESSION_COOKIE = 'dshra_session'

/**
 * Trust bootstrap the edge injects at the very start of the proxied index `<head>`.
 *
 * dsh decides whether the browser page may persist settings to the Host from
 * one fact: `connection.isLoopback`. Its client carrier computes that as
 * `transport.ownsHost === true || pageLocation === undefined ||
 * isLoopbackHostname(pageLocation.hostname)` — so a page served over the LAN or
 * a tunnel is classified non-loopback, the settings plane stays process-local,
 * and every settings-derived surface (model catalog, settings pages, this
 * plugin's own card) degrades.
 *
 * The Host side of the fence already accepts this page — the edge re-issues
 * every request with a loopback Host header behind the login gate — and the
 * carrier reads `globalThis.__DSH_TRANSPORT__` before installing the service,
 * so the browser half is closed by claiming the transport flag the Electron and
 * worker shells use for the same purpose. The script runs from `<head>`, long
 * before the client composition activates.
 *
 * `Object.assign` keeps whatever a shell already published, and pages that
 * already are loopback see a no-op claim. Only HTML the edge serves carries the
 * script, and every such page passed the login gate, so this cannot widen the
 * trusted surface.
 *
 * The script also marks the document as edge-served
 * (`__DSH_REMOTE_ACCESS_EDGE__`), which is the browser half's ONLY local/remote
 * discriminator. A page hostname cannot answer that question: the desktop shell
 * serves its own window from `dsh-app://app/` (a local page whose hostname is
 * not loopback), while this edge is remote whatever authority it is reached by.
 */
const TRUST_BOOTSTRAP = '<script data-plugin="dsh-remote-access">(function(){'
+ 'try{'
+ 'var current=globalThis.__DSH_TRANSPORT__;'
+ 'globalThis.__DSH_TRANSPORT__=Object.assign({},current,{ownsHost:true});'
+ 'globalThis.__DSH_REMOTE_ACCESS__=true;'
+ 'globalThis.__DSH_REMOTE_ACCESS_EDGE__=true;'
+ '}catch(e){'
+ 'try{console.warn("[dsh-remote-access] could not claim the local-host transport \u2014 settings may stay memory-scoped",e);globalThis.__DSH_REMOTE_ACCESS_BOOTSTRAP_FAILED__=1}catch(e2){}'
+ '}'
+ '})();</script>'

/** Login attempts before a per-IP lockout. */
const MAX_LOGIN_FAILURES = 8
/** Lockout window after the threshold. */
const LOGIN_LOCK_MS = 15 * 60 * 1000
/** Certificates are regenerated this long before expiry. */
const CERT_RENEW_MARGIN_MS = 30 * 24 * 60 * 60 * 1000
/**
 * Requested certificate lifetime. `selfsigned` 5.x dropped the v4 `days`
 * option and derives `notAfter` from `notAfterDate` (default: one year), so the
 * lifetime is stated as an absolute date; 4.x understands the same field.
 */
const CERT_VALIDITY_MS = 3650 * 24 * 60 * 60 * 1000
/** Body cap for login posts. */
const LOGIN_BODY_LIMIT = 8192
/** The index response is buffered for the marker injection up to this size. */
const INDEX_BUFFER_LIMIT = 1024 * 1024

/**
 * Plugin configuration, which is also the `remote-access` settings namespace:
 * one profile entry's Config fields ARE the page the browser half renders.
 *
 * Every field the card edits is `.volatile()`, so an accepted write commits
 * into this entry's live references and emits `loader/volatile-update` instead
 * of remounting the plugin (which would tear the edge down and rebuild it).
 * `sessionTtlMs` and `certName` are deliberately ordinary: they are not on the
 * card, and changing them in the profile document may remount normally.
 *
 * @property {boolean} enabled - start the edge listener.
 * @property {boolean} tls - serve the edge over TLS (self-signed) instead of plain HTTP.
 * @property {number} port - edge listen port.
 * @property {string} host - edge bind address.
 * @property {string} username - the single login user name.
 * @property {number} sessionTtlMs - session cookie lifetime.
 * @property {string} certName - subject name for the self-signed certificate.
 */
export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
  tls: z.boolean().default(true).volatile(),
  port: z.number().step(1).min(1).max(65535).default(3081).volatile(),
  host: z.union([z.const('0.0.0.0'), z.const('127.0.0.1')]).default('0.0.0.0').volatile(),
  username: z.string().min(1).max(64).default('admin').volatile(),
  sessionTtlMs: z.number().step(1).min(60_000).max(30 * 24 * 3_600_000).default(12 * 3_600_000),
  certName: z.string().min(1).max(253).default('localhost'),
})

/** DSH home root (certificates live here, never in the plugin directory). */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Whether a string is a dotted-quad IPv4 literal. */
function isIpv4(value) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
}

/**
 * Constant-time string comparison over sha256 digests (equal length by construction).
 * @param {string} a - first value.
 * @param {string} b - second value.
 * @returns whether the values are equal.
 */
function safeEqual(a, b) {
  const da = createHash('sha256').update(a, 'utf8').digest()
  const db = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(da, db)
}

/**
 * Ensure a usable self-signed certificate pair under dir, regenerating it
 * when absent or expiring within the margin.
 * @param {string} dir - certificate directory (created 0700).
 * @param {string} certName - subject name.
 * @param {(line: string) => void} log - diagnostic sink.
 * @returns the key and certificate PEM.
 */
async function ensureCertificate(dir, certName, log) {
  const keyPath = join(dir, 'key.pem')
  const certPath = join(dir, 'cert.pem')
  if (existsSync(keyPath) && existsSync(certPath)) {
    try {
      const cert = new X509Certificate(readFileSync(certPath, 'utf8'))
      if (Date.parse(cert.validTo) > Date.now() + CERT_RENEW_MARGIN_MS) {
        return { key: readFileSync(keyPath), cert: readFileSync(certPath) }
      }
    } catch (readFailure) {
      log(`certificate unreadable, regenerating: ${readFailure.message}`)
    }
  }
  const mod = await import('selfsigned')
  const generate = mod.generate ?? mod.default?.generate
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ]
  if (isIpv4(certName)) altNames.push({ type: 7, ip: certName })
  else if (certName !== 'localhost') altNames.push({ type: 2, value: certName })
  const p = await generate(
    [{ name: 'commonName', value: 'dsh-remote-access' }],
    {
      notBeforeDate: new Date(),
      notAfterDate: new Date(Date.now() + CERT_VALIDITY_MS),
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames }],
    },
  )
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(keyPath, p.private, { mode: 0o600 })
  writeFileSync(certPath, p.cert, { mode: 0o600 })
  log(`issued a self-signed certificate (subjectAltName: localhost, 127.0.0.1, ${certName})`)
  return { key: p.private, cert: p.cert }
}

/** The login page. */
const LOGIN_PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 远程访问</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #101318; color: #e6e9ee;
         font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  form { width: min(340px, calc(100vw - 48px)); background: #171b22; border: 1px solid #2a3040;
         border-radius: 12px; padding: 28px 24px; }
  h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  p.sub { margin: 0 0 20px; color: #8b93a3; font-size: 12px; }
  label { display: block; margin: 0 0 4px; color: #b6bdcc; font-size: 13px; }
  input { width: 100%; margin: 0 0 14px; padding: 9px 11px; border-radius: 8px;
          border: 1px solid #2a3040; background: #101318; color: #e6e9ee; font: inherit; }
  input:focus { outline: none; border-color: #4c7dff; }
  button { width: 100%; padding: 10px; border: 0; border-radius: 8px; cursor: pointer;
           background: #4c7dff; color: #fff; font: inherit; font-weight: 600; }
  button:disabled { opacity: .6; cursor: default; }
  .error { margin: 0 0 14px; padding: 8px 10px; border-radius: 8px; font-size: 13px;
           background: #3a1d22; border: 1px solid #6e3340; color: #ffb4c0; }
  .hint { margin: 14px 0 0; color: #6b7280; font-size: 11px; text-align: center; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>DSH 远程访问</h1>
  <p class="sub">登录以使用本实例的 Web 界面</p>
  <div id="error" class="error" hidden></div>
  <label for="username">用户名</label>
  <input id="username" name="username" autocomplete="username" required>
  <label for="password">密码</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button id="submit" type="submit">登录</button>
  <p class="hint">自签名证书：浏览器警告页选择「继续访问」</p>
</form>
<script>
  const form = document.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('error');
    const button = document.getElementById('submit');
    errorEl.hidden = true;
    button.disabled = true;
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (res.redirected) { location.replace(res.url); return }
      let message = '登录失败';
      try { message = (await res.json()).message ?? message } catch (_parseFailure) {}
      errorEl.textContent = message;
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
</script>
</body>
</html>
`

/** HTML-escape a value for embedding in a text node or attribute. */
function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Post-login landing page: confirms the edge login, offers the inner
 * launch-token URL for local direct access, and redirects to the proxied root.
 * @param {string|undefined} innerAuthUrl - the inner token URL, or undefined when unavailable.
 * @param {boolean} innerSessionEstablished - whether the inner session cookie was minted.
 * @returns {string} the landing document.
 */
function loginLandingHtml(innerAuthUrl, innerSessionEstablished) {
  const status = innerSessionEstablished
    ? '内层会话已自动建立，3 秒后进入。'
    : '内层会话未能自动建立。若在本机访问，请手动打开下方地址后再重试登录。'
  const direct = innerAuthUrl === undefined
    ? ''
    : '<p>本机直连地址（每次 dsh 重启后变化，可复制）：<code id="url">'
      + htmlEscape(innerAuthUrl) + '</code> '
      + '<button type="button" onclick="copyUrl(this)">复制</button></p>'
  return [
    '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="refresh" content="3;url=/">',
    '<title>DSH 远程访问 · 登录成功</title>',
    '<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:40em;margin:6em auto;padding:0 1.25em;line-height:1.7;color:#1c1c1c}',
    'h1{font-size:1.4em}code{background:#f0f0f0;padding:.15em .45em;border-radius:5px;word-break:break-all;font-size:.85em}',
    'button{padding:.2em .8em;border:1px solid #c5c5c5;border-radius:5px;background:#fafafa;cursor:pointer;font-size:.9em}',
    'a{color:#0b57d0}</style></head>',
    '<body><h1>登录成功</h1>',
    '<p>' + status + '</p>',
    direct,
    '<p><a href="/">立即进入</a></p>',
    "<script>function copyUrl(btn){var el=document.getElementById('url');var t=el?el.textContent:'';",
    "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){btn.textContent='已复制';setTimeout(function(){btn.textContent='复制'},1500)}).catch(function(){window.prompt('复制下面这行地址：',t)})}",
    "else{window.prompt('复制下面这行地址：',t)}}",
    '</script></body></html>',
  ].join('\n')
}

/**
 * One TLS edge entry: listener, session table, login gate, and the
 * loopback re-issue proxy (HTTP + WebSocket upgrade).
 */
class EdgeServer {
  /**
   * @param {object} options - the edge parameters.
   * @param {string} options.host - bind address.
   * @param {number} options.port - listen port.
   * @param {boolean} options.tls - serve over TLS (self-signed) when true, plain HTTP otherwise.
   * @param {number} options.mainPort - the loopback dsh web server port.
   * @param {string|undefined} options.innerAuthUrl - the inner launch-token URL used to mint the inner browser session after an edge login.
   * @param {object} options.credentials - the host credentials service.
   * @param {(line: string) => void} options.log - diagnostic sink.
   */
  constructor({ host, port, mainPort, tls, innerAuthUrl, credentials, log }) {
    this.host = host
    this.port = port
    this.tls = tls
    this.mainPort = mainPort
    this.innerAuthUrl = innerAuthUrl
    this.credentials = credentials
    this.log = log
    this.sessions = new Map()
    this.loginFailures = new Map()
    this.upgradeSockets = new Set()
    this.server = null
    /** Live-mutable fields refreshed without a restart. */
    this.username = ''
    this.sessionTtlMs = 0
    this.lastInnerMint = false
  }

  /**
   * @param {{ username: string, sessionTtlMs: number }} fields - the live values.
   */
  refresh(fields) {
    this.username = fields.username
    this.sessionTtlMs = fields.sessionTtlMs
  }

  /** Session cookie attributes (Secure is only valid over TLS). */
  get cookieAttrs() {
    return `HttpOnly; SameSite=Lax${this.tls ? '; Secure' : ''}`
  }

  /** @returns a promise resolving when the listener is up. */
  async start(certKey, certPem) {
    const handler = (req, res) => {
      this.handle(req, res).catch((error) => {
        this.log(`request handling failed: ${error.stack ?? error}`)
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' })
        res.end('internal error')
      })
    }
    this.server = this.tls ? https.createServer({ key: certKey, cert: certPem }, handler) : http.createServer(handler)
    this.server.on('upgrade', (req, socket, head) => { this.handleUpgrade(req, socket, head) })
    this.server.on('clientError', (_err, socket) => { socket.destroy() })
    this.sweepTimer = setInterval(() => this.sweep(), 3_600_000)
    this.sweepTimer.unref()
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.port, this.host, () => { this.server.removeListener('error', reject); resolve() })
    })
    this.log(`edge listening on ${this.tls ? 'https' : 'http'}://${this.host}:${this.port} (proxying to http://127.0.0.1:${this.mainPort})`)
  }

  /** @returns a promise resolving when the listener and its connections are closed. */
  async stop() {
    for (const socket of this.upgradeSockets) socket.destroy()
    this.upgradeSockets.clear()
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    if (this.server === null) return
    const server = this.server
    this.server = null
    const closed = new Promise((resolve) => { server.close(() => resolve()) })
    server.closeAllConnections()
    await closed
    this.log(`edge stopped (${this.tls ? 'https' : 'http'}://${this.host}:${this.port})`)
  }

  /** Drop expired sessions and stale failure counters. */
  sweep() {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
    for (const [ip, record] of this.loginFailures) {
      if (record.lockUntil <= now) this.loginFailures.delete(ip)
    }
  }

  /** @param {import('node:http').IncomingMessage} req - the edge request. */
  clientIp(req) {
    return req.socket.remoteAddress ?? 'unknown'
  }

  /** @param {import('node:http').IncomingMessage} req - the edge request. */
  lockedOut(req) {
    const record = this.loginFailures.get(this.clientIp(req))
    return record !== undefined && record.lockUntil > Date.now()
  }

  /** @param {import('node:http').IncomingMessage} req - the edge request. */
  recordFailure(req) {
    const ip = this.clientIp(req)
    const record = this.loginFailures.get(ip) ?? { count: 0, lockUntil: 0 }
    record.count += 1
    if (record.count >= MAX_LOGIN_FAILURES) {
      record.count = 0
      record.lockUntil = Date.now() + LOGIN_LOCK_MS
      this.log(`login lockout for ${ip} until ${new Date(record.lockUntil).toISOString()}`)
    }
    this.loginFailures.set(ip, record)
  }

  /**
   * Read and validate the session cookie.
   * @param {import('node:http').IncomingMessage} req - the edge request.
   * @returns the session, refreshed, or undefined.
   */
  sessionOf(req) {
    const header = req.headers.cookie
    if (typeof header !== 'string') return undefined
    for (const part of header.split(';')) {
      const eq = part.indexOf('=')
      if (eq <= 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue
      const token = part.slice(eq + 1).trim()
      const session = this.sessions.get(token)
      if (session === undefined) continue
      if (session.expiresAt <= Date.now()) {
        this.sessions.delete(token)
        continue
      }
      session.lastSeenAt = Date.now()
      return session
    }
    return undefined
  }

  /**
   * The edge request router.
   * @param {import('node:http').IncomingMessage} req - the edge request.
   * @param {import('node:http').ServerResponse} res - the edge response.
   */
  async handle(req, res) {
    const url = new URL(req.url ?? '/', 'https://placeholder')
    if (url.pathname === '/login') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(LOGIN_PAGE)
        return
      }
      if (req.method === 'POST') {
        await this.handleLogin(req, res)
        return
      }
      res.writeHead(405, { allow: 'GET, POST' })
      res.end('method not allowed')
      return
    }
    if (url.pathname === '/logout') {
      const header = req.headers.cookie
      if (typeof header === 'string') {
        for (const part of header.split(';')) {
          const eq = part.indexOf('=')
          if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) {
            this.sessions.delete(part.slice(eq + 1).trim())
          }
        }
      }
      res.writeHead(302, { location: '/login', 'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; ${this.cookieAttrs}` })
      res.end()
      return
    }
    if (url.pathname === '/login-ok') {
      if (req.method !== 'GET' || this.sessionOf(req) === undefined) {
        res.writeHead(302, { location: '/login' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(loginLandingHtml(this.innerAuthUrl, this.lastInnerMint))
      return
    }
    if (this.sessionOf(req) === undefined) {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        res.writeHead(302, { location: '/login' })
        res.end()
        return
      }
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 'login-required', message: '请先登录' }))
      return
    }
    this.proxyHttp(req, res)
  }

  /**
   * One login post: validate, mint the session, set the cookie.
   * @param {import('node:http').IncomingMessage} req - the edge request.
   * @param {import('node:http').ServerResponse} res - the edge response.
   */
  async handleLogin(req, res) {
    if (this.lockedOut(req)) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: '尝试过多，请 15 分钟后再试' }))
      return
    }
    let body = ''
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > LOGIN_BODY_LIMIT) {
        res.writeHead(413, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ message: '请求体过大' }))
        return
      }
      body += chunk
    }
    const form = new URLSearchParams(body)
    const username = form.get('username') ?? ''
    const password = form.get('password') ?? ''
    let stored = undefined
    try {
      const resolved = await this.credentials.resolve(PASSWORD_REF)
      stored = resolved?.value
    } catch (resolveFailure) {
      this.log(`credential resolve failed: ${resolveFailure.stack ?? resolveFailure}`)
    }
    const usernameOk = typeof stored === 'string' && safeEqual(username, this.username)
    const passwordOk = typeof stored === 'string' && password.length > 0 && safeEqual(password, stored)
    if (!usernameOk || !passwordOk || stored === undefined) {
      this.recordFailure(req)
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: '用户名或密码错误' }))
      return
    }
    this.loginFailures.delete(this.clientIp(req))
    const token = randomBytes(32).toString('hex')
    const now = Date.now()
    this.sessions.set(token, { createdAt: now, lastSeenAt: now, expiresAt: now + this.sessionTtlMs })
    const edgeCookie = SESSION_COOKIE + '=' + token + '; Path=/; Max-Age='
      + Math.floor(this.sessionTtlMs / 1000) + '; ' + this.cookieAttrs
    const innerCookie = await this.mintInnerSessionCookie()
    this.lastInnerMint = innerCookie !== undefined
    const cookies = [edgeCookie]
    if (innerCookie !== undefined) cookies.push(innerCookie)
    res.writeHead(302, {
      location: '/login-ok',
      'cache-control': 'no-store',
      'set-cookie': cookies,
    })
    res.end()
  }

  /**
   * Exchange this process's launch token for the inner browser-session cookie
   * over loopback. The request Host matches the authority the proxy rewrites
   * to, so the minted cookie is accepted by the inner server behind the edge.
   * @returns {Promise<string|undefined>} the raw Set-Cookie value, or undefined when unreachable.
   */
  mintInnerSessionCookie() {
    if (this.innerAuthUrl === undefined) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      let settled = false
      const finish = (cookie) => { if (!settled) { settled = true; resolve(cookie) } }
      let req
      try {
        req = http.get(this.innerAuthUrl, { agent: false, timeout: 3000 }, (res) => {
          const cookie = res.headers['set-cookie']
          finish(Array.isArray(cookie) ? cookie[0] : cookie)
          res.resume()
          res.on('end', () => {})
        })
        req.on('error', (error) => {
          this.log('inner session mint failed: ' + error.message)
          finish(undefined)
        })
        req.on('timeout', () => {
          req.destroy()
          finish(undefined)
        })
      } catch (mintFailure) {
        this.log('inner session mint failed: ' + mintFailure.message)
        finish(undefined)
      }
    })
  }

  /**
   * Re-issue an authenticated request to the loopback dsh web server.
   * @param {import('node:http').IncomingMessage} req - the edge request.
   * @param {import('node:http').ServerResponse} res - the edge response.
   */
  proxyHttp(req, res) {
    const target = `http://127.0.0.1:${this.mainPort}${req.url}`
    const headers = { ...req.headers }
    delete headers.host
    delete headers.origin
    headers.host = `127.0.0.1:${this.mainPort}`
    const isIndex = req.method === 'GET' && new URL(req.url ?? '/', 'https://x').pathname === '/'
    // The index is rewritten in place, so it must cross the wire uncompressed:
    // a compressed body cannot be edited, and stripping content-encoding from
    // compressed bytes would hand the browser raw gzip as text.
    if (isIndex) headers['accept-encoding'] = 'identity'
    const upstream = http.request(target, { method: req.method, headers, agent: false }, (up) => {
      const isHtml = typeof up.headers['content-type'] === 'string' && up.headers['content-type'].includes('text/html')
      if (isIndex && isHtml) {
        const chunks = []
        let size = 0
        let streaming = false
        up.on('data', (chunk) => {
          size += chunk.length
          if (streaming) return
          if (size > INDEX_BUFFER_LIMIT) {
            // Too large to rewrite: pass the complete response through untouched.
            streaming = true
            res.writeHead(up.statusCode ?? 502, up.headers)
            for (const buffered of chunks) res.write(buffered)
            up.pipe(res)
          } else {
            chunks.push(chunk)
          }
        })
        up.on('end', () => {
          if (streaming) return
          let html = Buffer.concat(chunks).toString('utf8')
          if (!html.includes('__DSH_REMOTE_ACCESS__')) {
            // Front-of-`<head>` on purpose: the claim must be in place before
            // the dsh client composition installs its Connection service.
            html = html.includes('<head>') ? html.replace('<head>', `<head>${TRUST_BOOTSTRAP}`) : html
          }
          const out = Buffer.from(html, 'utf8')
          const headersOut = { ...up.headers, 'content-length': out.length }
          delete headersOut['content-encoding']
          delete headersOut['transfer-encoding']
          res.writeHead(up.statusCode ?? 502, headersOut)
          res.end(out)
        })
      } else {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      }
    })
    upstream.on('error', (error) => {
      this.log(`upstream error: ${error.message}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end('upstream unavailable')
    })
    req.pipe(upstream)
  }

  /**
   * A WebSocket upgrade: authenticate, then pipe a raw TCP pair to loopback.
   * @param {import('node:http').IncomingMessage} req - the upgrade request.
   * @param {import('node:net').Socket} socket - the client socket.
   * @param {Buffer} head - the first payload chunk.
   */
  handleUpgrade(req, socket, head) {
    if (this.sessionOf(req) === undefined) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    const upstream = net.connect(this.mainPort, '127.0.0.1')
    this.upgradeSockets.add(socket)
    this.upgradeSockets.add(upstream)
    const headers = { ...req.headers }
    delete headers.origin
    headers.host = `127.0.0.1:${this.mainPort}`
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
    for (const [key, value] of Object.entries(headers)) {
      raw += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
    }
    raw += '\r\n'
    let failed = false
    const fail = (reason) => {
      if (failed) return
      failed = true
      this.log(`upgrade failed: ${reason}`)
      upstream.destroy()
      socket.destroy()
    }
    upstream.on('connect', () => {
      upstream.write(raw, 'utf8')
      if (head?.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => fail('upstream'))
    socket.on('error', () => fail('client'))
    upstream.on('close', () => {
      this.upgradeSockets.delete(upstream)
      socket.destroy()
    })
    socket.on('close', () => {
      this.upgradeSockets.delete(socket)
      upstream.destroy()
    })
  }
}

/**
 * Applies the desired edge state (start/stop/restart) for a config value,
 * reusing the live listener when only refreshable fields moved.
 */
class EdgeController {
  /**
   * @param {object} options - the controller inputs.
   * @param {object} options.ctx - the plugin context.
   * @param {(line: string) => void} options.log - diagnostic sink.
   */
  constructor({ ctx, log }) {
    this.ctx = ctx
    this.log = log
    /** @type {EdgeServer | null} */
    this.edge = null
    this.fingerprint = ''
    this.pending = Promise.resolve()
    this.disposed = false
  }

  /**
   * @param {{ enabled: boolean, tls: boolean, port: number, host: string, username: string, sessionTtlMs: number, certName: string }} config - the effective config.
   */
  sync(config) {
    if (this.disposed) return this.pending
    this.pending = this.pending.then(() => this.syncInternal(config)).catch((error) => {
      this.log(`edge sync failed: ${error.stack ?? error}`)
    })
    return this.pending
  }

  /** @param {Parameters<EdgeController['sync']>[0]} config - the effective config. */
  async syncInternal(config) {
    const mainPort = this.ctx.webServer.port
    const credentials = this.ctx.credentials
    if (!config.enabled) {
      if (this.edge !== null) {
        const edge = this.edge
        this.edge = null
        this.fingerprint = ''
        await edge.stop()
      }
      return
    }
    const fingerprint = `${config.host}:${config.port}:${config.certName}:${config.tls}`
    const needsRestart = this.edge !== null && this.fingerprint !== fingerprint
    if (this.edge !== null && !needsRestart) {
      this.edge.refresh({ username: config.username, sessionTtlMs: config.sessionTtlMs })
      return
    }
    if (this.edge !== null) {
      const edge = this.edge
      this.edge = null
      this.fingerprint = ''
      await edge.stop()
    }
    let key = undefined
    let cert = undefined
    if (config.tls) {
      const certDir = join(dshHome(), 'dsh-remote-access')
      ;({ key, cert } = await ensureCertificate(certDir, config.certName, this.log))
    }
    let innerAuthUrl
    try {
      innerAuthUrl = this.ctx.connection.authenticatedUrl('http://127.0.0.1:' + String(mainPort))
    } catch (exposureFailure) {
      this.log('inner auth url unavailable: ' + exposureFailure.message)
      innerAuthUrl = undefined
    }
    const edge = new EdgeServer({ host: config.host, port: config.port, mainPort, tls: config.tls, credentials, innerAuthUrl, log: this.log })
    edge.refresh({ username: config.username, sessionTtlMs: config.sessionTtlMs })
    try {
      await edge.start(key, cert)
    } catch (error) {
      this.log(`edge failed to listen on ${config.host}:${config.port}: ${error.message}`)
      return
    }
    this.edge = edge
    this.fingerprint = fingerprint
  }

  /** Stop the edge at plugin unload. */
  async dispose() {
    this.disposed = true
    await this.pending
    if (this.edge !== null) {
      const edge = this.edge
      this.edge = null
      this.fingerprint = ''
      await edge.stop()
    }
  }
}

/**
 * Read one config field, unwrapping a volatile reference (0.2.x hands live
 * fields to the plugin as stable `{ get() }` handles).
 * @param {unknown} value - a raw or volatile config value.
 * @returns the current plain value.
 */
function live(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

/**
 * Read the effective edge parameters out of the entry config.
 * @param {object|undefined} config - the resolved entry config.
 * @returns the plain values the edge controller consumes.
 */
function effectiveConfig(config) {
  const read = (key, fallback) => {
    const value = live(config?.[key])
    return value === undefined ? fallback : value
  }
  return {
    enabled: read('enabled', false),
    tls: read('tls', true),
    port: read('port', 3081),
    host: read('host', '0.0.0.0'),
    username: read('username', 'admin'),
    sessionTtlMs: read('sessionTtlMs', 12 * 3_600_000),
    certName: read('certName', 'localhost'),
  }
}

/**
 * Mount the remote-access capability: the settings presentation policy for this
 * entry and the edge state machine driven by its live config.
 *
 * 0.2.x exposes this entry's Config as the `remote-access` settings namespace
 * with no registration call; `configure({ auto: false })` only suppresses the
 * page the settings service would otherwise generate, because the browser half
 * renders its own section for the same namespace.
 * @param {object} ctx - the plugin context (webServer + credentials injected).
 * @param {z.output<typeof Config>} config - the resolved entry config; volatile fields are live references.
 */
export function apply(ctx, config) {
  const log = (line) => { ctx.logger.info(`[dsh-remote-access] ${line}`) }
  const controller = new EdgeController({ ctx, log })
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'remote-access: settings presentation',
    )
  })
  // Volatile-only writes commit in place, so the running edge is re-synced
  // rather than remounted; a stampede of writes still serializes behind
  // EdgeController.sync's queue.
  ctx.on('loader/volatile-update', () => { void controller.sync(effectiveConfig(config)) })
  ctx.effect(() => {
    void controller.sync(effectiveConfig(config))
    return () => { void controller.dispose() }
  }, 'remote-access: edge lifecycle')
}

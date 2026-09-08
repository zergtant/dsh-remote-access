/**
 * dsh remote access — browser half.
 *
 * Mounts a first-level settings section ("远程访问") next to 通用设置/模型/插件,
 * and routes a gated 401 to the login page. No non-baseline module requests:
 * react + react/jsx-runtime resolve from the platform seed table, and the
 * reactive state is a local snapshot source.
 */

/** Settings namespace the section edits (the host half spells the same value). */
const NS = 'remote-access'

/** Credential reference holding the login password. */
const CREDENTIAL_REF = 'DSH_REMOTE_ACCESS_PASSWORD'

/** Locale dictionary namespace. */
const DICT_NS = 'remote-access'

/** Position among the first-level settings sections (after 插件/Agent 预设). */
const SECTION_ORDER = 25

const zh = {
  nav: '远程访问',
  title: 'dsh 远程访问',
  description: 'TLS 远程入口：登录页 + 会话 cookie，透明代理到本机 GUI',
  statusRunning: '运行中',
  statusStopped: '未启用',
  start: '启动',
  stop: '停止',
  dirtyRunning: '有未保存的更改：当前服务仍按已保存的配置运行，点「保存」生效',
  dirtyStopped: '有未保存的更改：保存后才会生效',
  tls: 'TLS（https，自签证书）',
  tlsHint: '取消勾选则使用明文 http（仅内网/调试）',
  noPasswordWarn: '已启用但未配置密码：登录会被拒绝，请先填写密码并保存',
  port: '端口',
  host: '监听地址',
  username: '用户名',
  password: '密码',
  passwordHint: '留空保持不变；填写后随保存更新',
  passwordConfigured: '已配置',
  passwordMissing: '未配置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃',
  readOnly: '当前设置不可写',
  saveFailed: '保存失败，请重试',
  invalidPort: '端口须为 1–65535 的整数',
  invalidUsername: '用户名不能为空',
  hostAll: '所有网卡（0.0.0.0）',
  hostLoop: '仅本机（127.0.0.1）',
  remoteReadOnly: '远程端只读：修改配置会立即中断当前会话，请在本机 127.0.0.1 的 GUI 中修改',
} as const

const en = {
  nav: 'Remote Access',
  title: 'dsh remote access',
  description: 'TLS edge entry: login page + session cookie, proxied to the local GUI',
  statusRunning: 'running',
  statusStopped: 'stopped',
  start: 'Start',
  stop: 'Stop',
  dirtyRunning: 'Unsaved changes: the running service still uses the saved configuration — save to apply',
  dirtyStopped: 'Unsaved changes: applied only after you save',
  tls: 'TLS (https, self-signed)',
  tlsHint: 'Uncheck for plain http (LAN/debug only)',
  noPasswordWarn: 'Enabled but no password configured: logins are rejected until one is saved',
  port: 'Port',
  host: 'Bind address',
  username: 'Username',
  password: 'Password',
  passwordHint: 'Leave blank to keep; a typed value updates on save',
  passwordConfigured: 'configured',
  passwordMissing: 'not configured',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  readOnly: 'Settings are not writable',
  saveFailed: 'Save failed, retry',
  invalidPort: 'Port must be an integer from 1 to 65535',
  invalidUsername: 'Username cannot be empty',
  hostAll: 'All interfaces (0.0.0.0)',
  hostLoop: 'Loopback only (127.0.0.1)',
  remoteReadOnly: 'Read-only while remote: changing settings drops this session — make changes in the local GUI on 127.0.0.1',
} as const

/** The section's snapshot (the hook-compartment observable). */
interface RemoteAccessState {
  /** Whether the Host serves the namespace at all. */
  available: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  /**
   * Whether this page is a remote edge session (non-loopback origin). Remote
   * sessions are read-only: committing a change would drop the very
   * connection serving the page. Derived from the raw page hostname, because
   * the edge bootstrap pins `connection.isLoopback` to true on remote pages.
   */
  remote: boolean
  /** Whether a save is crossing the wire. */
  saving: boolean
  /** Whether the last save failed. */
  failed: boolean
  /** Whether the Host reports a configured login password. */
  passwordConfigured: boolean
  /** Draft values the controls render (enabled/tls reflect the live service). */
  enabled: boolean
  tls: boolean
  port: string
  host: string
  username: string
  password: string
  /** Committed service parameters — what the status line reports as running. */
  committedPort: number
  committedTls: boolean
  committedHost: string
  /** Whether a save would write anything. */
  dirty: boolean
  /** Whether any draft is invalid, which blocks saving. */
  invalid: boolean
}

/** The registration-side face the section's slot entry injects. */
interface RemoteAccessFace {
  hooks: {
    /** Section snapshot bound by the renderer as useRemoteAccess. */
    remoteAccess: { getSnapshot: () => RemoteAccessState; subscribe: (listener: () => void) => () => void }
  }
  setField: (field: 'tls' | 'port' | 'host' | 'username' | 'password', value: string) => void
  /** Commit the enable switch immediately (no save step). */
  toggleEnabled: (next: boolean) => Promise<void>
  save: () => Promise<void>
  discard: () => void
}

/** What the renderer binds for the section (locale + inject face). */
interface RemoteAccessSectionProps {
  t: (key: keyof typeof zh) => string
  useRemoteAccess: (selector: (state: RemoteAccessState) => RemoteAccessState) => RemoteAccessState
  setField: RemoteAccessFace['setField']
  toggleEnabled: (next: boolean) => Promise<void>
  save: () => Promise<void>
  discard: () => void
}

/** A minimal snapshot source (getSnapshot/subscribe) for the hook compartment. */
function createSnapshotSource(initial: RemoteAccessState) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next: RemoteAccessState) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Parse a draft port; undefined when it is not a valid port. */
function parsePort(text: string): number | undefined {
  if (!/^\d{1,5}$/.test(text)) return undefined
  const value = Number(text)
  return value >= 1 && value <= 65535 ? value : undefined
}

/** The settings-scope face the controller consumes (structural). */
interface SettingsScopeFace {
  getSnapshot: () => {
    status: string
    value?: { enabled?: boolean; tls?: boolean; port?: number; host?: string; username?: string }
    writable: boolean
  }
  subscribe: (listener: () => void) => () => void
  set: (field: string, value: unknown) => Promise<void>
  mutate: (ops: Array<{ op: 'set'; path: string[]; value: unknown }>) => Promise<void>
}

/** The editable fields shared by the draft and the committed snapshot. */
type FieldSet = { enabled: boolean; tls: boolean; port: number; host: string; username: string }

/**
 * The credentials wire face the controller consumes (structural): the 0.1.2
 * remote-namespace shape (positional requests, ClientResult envelope), not the
 * 0.1.1 apiproxy envelope. Writes also return a ClientResult in 0.1.3.
 */
interface CredentialsFace {
  set: (ref: string, value: string) => Promise<{ ok: boolean; error?: unknown }>
  describe: (refs: string[]) => Promise<{
    ok: boolean
    value?: Record<string, { configured?: boolean; writable?: boolean }>
    error?: unknown
  }>
}

/**
 * Bridges the settings scope and the credentials wire onto the section state.
 */
class CardController {
  private readonly source: ReturnType<typeof createSnapshotSource>
  /** The last value the Host confirmed. */
  private committed: FieldSet
  /** What the controls show and edit. */
  private draft: FieldSet
  private password = ''
  private passwordConfigured = false
  private saving = false
  private failed = false
  private disposed = false
  private readonly unsubscribeScope: () => void

  /**
   * @param scope - the bound settings scope for the `remote-access` namespace.
   * @param credentialsApi - the credentials wire face.
   * @param remote - whether the page is a remote edge session (read-only).
   * @param log - diagnostic sink.
   */
  constructor(
    private readonly scope: SettingsScopeFace,
    private readonly credentialsApi: CredentialsFace,
    private readonly remote: boolean,
    private readonly log: (line: string) => void,
  ) {
    this.committed = this.committedFromSnapshot()
    this.draft = { ...this.committed }
    this.source = createSnapshotSource(this.project())
    this.unsubscribeScope = scope.subscribe(() => {
      if (this.disposed) return
      const next = this.committedFromSnapshot()
      // Host commits (including the instant enable toggle) refresh committed;
      // a field the user is still editing stays at its draft value.
      for (const key of ['enabled', 'tls', 'port', 'host', 'username'] as const) {
        if (this.draft[key] === this.committed[key]) this.draft[key] = next[key]
      }
      this.committed = next
      this.publish()
    })
    void this.readCredential()
  }

  private committedFromSnapshot(): FieldSet {
    const value = this.scope.getSnapshot().value ?? {}
    return {
      enabled: value.enabled ?? false,
      tls: value.tls ?? true,
      port: value.port ?? 3081,
      host: value.host ?? '0.0.0.0',
      username: value.username ?? 'admin',
    }
  }

  private project(): RemoteAccessState {
    const snapshot = this.scope.getSnapshot()
    const portValid = parsePort(String(this.draft.port)) !== undefined
    return {
      available: snapshot.status !== 'unavailable',
      writable: snapshot.writable,
      saving: this.saving,
      failed: this.failed,
      passwordConfigured: this.passwordConfigured,
      remote: this.remote,
      enabled: this.draft.enabled,
      tls: this.draft.tls,
      port: String(this.draft.port),
      host: this.draft.host,
      username: this.draft.username,
      password: this.password,
      committedPort: this.committed.port,
      committedTls: this.committed.tls,
      committedHost: this.committed.host,
      dirty:
        this.password.length > 0 ||
        this.draft.tls !== this.committed.tls ||
        this.draft.port !== this.committed.port ||
        this.draft.host !== this.committed.host ||
        this.draft.username !== this.committed.username,
      invalid: !portValid || this.draft.username.length === 0,
    }
  }

  private publish(): void {
    this.source.set(this.project())
  }

  private async readCredential(): Promise<void> {
    try {
      const response = await this.credentialsApi.describe([CREDENTIAL_REF])
      // A refusal or error leaves the last-known state stale-unknown: the
      // badge reports unconfigured rather than claiming a password that the
      // Host may no longer hold.
      this.passwordConfigured = response.ok ? response.value?.[CREDENTIAL_REF]?.configured ?? false : false
    } catch (_readFailure) {
      // The section stays usable; a write still reaches the Host.
      this.passwordConfigured = false
    }
    if (!this.disposed) this.publish()
  }

  /**
   * @param field - the draft field (the enable switch commits itself, not through here).
   * @param value - the raw control text (checkbox state as 'true'/'false').
   */
  setField(field: 'tls' | 'port' | 'host' | 'username' | 'password', value: string): void {
    // Remote sessions are read-only: a committed change drops the live edge
    // connection serving this page.
    if (this.disposed || this.saving || this.remote) return
    if (field === 'password') {
      this.password = value
    } else if (field === 'tls') {
      this.draft.tls = value === 'true'
    } else if (field === 'host') {
      this.draft.host = value
    } else if (field === 'username') {
      this.draft.username = value
    } else {
      // Keep the invalid draft visible; a valid replacement lands here.
      const parsed = parsePort(value)
      if (parsed !== undefined) this.draft.port = parsed
      else this.draft.port = Number(value) || 0
    }
    this.publish()
  }

  /** Commit the enable switch to the Host immediately (no save step). */
  async toggleEnabled(next: boolean): Promise<void> {
    if (this.disposed || this.saving || this.remote || this.committed.enabled === next) return
    this.draft.enabled = next
    this.saving = true
    this.failed = false
    this.publish()
    try {
      await this.scope.set('enabled', next)
      if (this.scope.getSnapshot().value?.enabled !== next) {
        throw new Error('Host did not accept the enable change')
      }
    } catch (toggleFailure) {
      this.log(`enable toggle failed: ${String(toggleFailure)}`)
      this.failed = true
      this.draft.enabled = this.committed.enabled
    } finally {
      this.saving = false
      if (!this.disposed) this.publish()
    }
  }

  /** Write every staged difference (the enable switch is not one of them). */
  async save(): Promise<void> {
    if (this.disposed || this.saving || this.remote) return
    const state = this.project()
    if (state.invalid || !state.dirty) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      const before = this.committedFromSnapshot()
      const desired = { ...this.draft }
      const fields = ['tls', 'port', 'host', 'username'] as const
      const changes = fields.filter(key => before[key] !== desired[key])
      if (changes.length > 0) {
        // One revision-fenced commit avoids restarting the edge for each field.
        await this.scope.mutate(changes.map(key => ({ op: 'set', path: [key], value: desired[key] })))
        const accepted = this.committedFromSnapshot()
        if (changes.some(key => accepted[key] !== desired[key])) {
          throw new Error('Host did not accept the settings change')
        }
      }
      if (this.password.trim().length > 0) {
        const response = await this.credentialsApi.set(CREDENTIAL_REF, this.password.trim())
        if (!response.ok) throw new Error('Host rejected the credential write')
        this.password = ''
      }
      this.committed = this.committedFromSnapshot()
      for (const key of ['tls', 'port', 'host', 'username'] as const) this.draft[key] = this.committed[key]
      await this.readCredential()
    } catch (writeFailure) {
      this.log(`save failed: ${String(writeFailure)}`)
      this.failed = true
    } finally {
      this.saving = false
      if (!this.disposed) this.publish()
    }
  }

  /** Drop every staged edit; the controls follow the Host snapshot. */
  discard(): void {
    if (this.disposed || this.saving) return
    this.password = ''
    this.failed = false
    this.committed = this.committedFromSnapshot()
    this.draft = { ...this.committed }
    this.publish()
  }

  /** Stop following the scope. */
  dispose(): void {
    this.disposed = true
    this.unsubscribeScope()
  }

  /** @returns the registration-side face. */
  inject(): RemoteAccessFace {
    return {
      hooks: {
        remoteAccess: {
          getSnapshot: this.source.getSnapshot,
          subscribe: this.source.subscribe,
        },
      },
      setField: (field, value) => { this.setField(field, value) },
      toggleEnabled: (next) => this.toggleEnabled(next),
      save: () => this.save(),
      discard: () => this.discard(),
    }
  }
}

/** The first-level settings section page. */
function RemoteAccessSection(props: RemoteAccessSectionProps) {
  const state = props.useRemoteAccess((snapshot) => snapshot)
  const t = props.t
  if (!state.available) return null
  // Remote sessions stay view-only even when the Host document is writable.
  const canWrite = state.writable && !state.remote
  const saveBlocked = !state.dirty || state.saving || state.invalid || !canWrite
  return (
    <div className="ra-page">
      <style>{RA_PAGE_STYLES}</style>
      <h3 className="ra-title">{t('title')}</h3>
      <p className="ra-lead">{t('description')}</p>
      <div className="ra-actions">
        <button
          type="button"
          className={state.enabled ? 'ra-stop' : 'ra-start'}
          disabled={!canWrite || state.saving}
          onClick={() => { void props.toggleEnabled(!state.enabled) }}
        >
          {state.saving ? t('saving') : state.enabled ? t('stop') : t('start')}
        </button>
        <span className={`ra-status${state.enabled ? ' ra-status-on' : ''}`} role="status">
          {state.enabled ? `${t('statusRunning')} · ${state.committedTls ? 'https' : 'http'}://${state.committedHost}:${state.committedPort}` : t('statusStopped')}
        </span>
      </div>
      {state.remote ? <p className="ra-readonly" role="status">{t('remoteReadOnly')}</p> : null}
      {!state.remote && !state.writable ? <p className="ra-readonly" role="status">{t('readOnly')}</p> : null}
      <label className="ra-row ra-row-check">
        <input
          type="checkbox"
          className="ra-check"
          checked={state.tls}
          disabled={!canWrite || state.saving}
          onChange={(event) => { props.setField('tls', event.target.checked ? 'true' : 'false') }}
        />
        <span>{t('tls')}</span>
      </label>
      <p className="ra-hint">{t('tlsHint')}</p>
      {state.enabled && !state.passwordConfigured ? <p className="ra-warn" role="status">{t('noPasswordWarn')}</p> : null}
      <label className="ra-row">
        <span className="ra-label">{t('port')}</span>
        <input
          className="ra-input"
          inputMode="numeric"
          value={state.port}
          disabled={!canWrite || state.saving}
          onChange={(event) => { props.setField('port', event.target.value) }}
        />
      </label>
      {state.invalid && state.username.length > 0 ? <p className="ra-error">{t('invalidPort')}</p> : null}
      <label className="ra-row">
        <span className="ra-label">{t('host')}</span>
        <select
          className="ra-input"
          value={state.host}
          disabled={!canWrite || state.saving}
          onChange={(event) => { props.setField('host', event.target.value) }}
        >
          <option value="0.0.0.0">{t('hostAll')}</option>
          <option value="127.0.0.1">{t('hostLoop')}</option>
        </select>
      </label>
      <label className="ra-row">
        <span className="ra-label">{t('username')}</span>
        <input
          className="ra-input"
          value={state.username}
          disabled={!canWrite || state.saving}
          onChange={(event) => { props.setField('username', event.target.value) }}
        />
      </label>
      {state.username.length === 0 ? <p className="ra-error">{t('invalidUsername')}</p> : null}
      <label className="ra-row">
        <span className="ra-label">
          {t('password')}{' '}
          <em className={`ra-state${state.passwordConfigured ? ' ra-state-ok' : ''}`}>
            {state.passwordConfigured ? t('passwordConfigured') : t('passwordMissing')}
          </em>
        </span>
        <input
          className="ra-input"
          type="password"
          autoComplete="new-password"
          placeholder={t('passwordHint')}
          value={state.password}
          disabled={!canWrite || state.saving}
          onChange={(event) => { props.setField('password', event.target.value) }}
        />
      </label>
      {state.dirty ? <p className="ra-dirty" role="status">{state.enabled ? t('dirtyRunning') : t('dirtyStopped')}</p> : null}
      <div className="ra-footer">
        {state.failed ? <p className="ra-error" role="status">{t('saveFailed')}</p> : null}
        <button
          type="button"
          className="ra-discard"
          disabled={!state.dirty || state.saving}
          onClick={() => { props.discard() }}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          className="ra-save"
          disabled={saveBlocked}
          onClick={() => { void props.save() }}
        >
          {state.saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}

/**
 * Section page styles — theme-adaptive. No hardcoded surface colors: text
 * inherits the dialog color and the box uses a transparent background plus a
 * currentColor-derived border, so the same markup reads in light and dark.
 */
const RA_PAGE_STYLES = `
.ra-page { display: flex; flex-direction: column; gap: 12px; max-width: 560px; }
.ra-title { margin: 0; font-size: 16px; font-weight: 600; }
.ra-lead { margin: -8px 0 0; font-size: 12px; color: inherit; opacity: .6; }
.ra-status { margin: 0; font-size: 12px; color: inherit; opacity: .6; }
.ra-status-on { color: #2f9e5f; opacity: 1; font-weight: 600; }
.ra-actions { display: flex; align-items: center; gap: 12px; }
.ra-start { padding: 8px 18px; border-radius: 8px; border: 0; background: #2f9e5f; color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.ra-stop { padding: 8px 18px; border-radius: 8px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); background: transparent; color: inherit; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.ra-start:disabled, .ra-stop:disabled { opacity: .5; cursor: default; }
.ra-dirty { margin: 0; padding: 8px 10px; border-radius: 7px; font-size: 12px; color: #b7791f; background: color-mix(in srgb, #b7791f 12%, transparent); }
.ra-hint { margin: -6px 0 0 26px; font-size: 11px; color: inherit; opacity: .55; }
.ra-warn { margin: 0; font-size: 12px; color: #b7791f; }
.ra-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.ra-row-check { gap: 8px; }
.ra-row .ra-label { flex: 0 0 120px; color: inherit; opacity: .7; }
.ra-input { flex: 1; min-width: 0; padding: 7px 10px; border-radius: 7px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; font: inherit; }
.ra-input::placeholder { color: inherit; opacity: .45; }
.ra-check { accent-color: #4c7dff; }
.ra-state { font-style: normal; font-size: 11px; color: inherit; opacity: .55; }
.ra-state-ok { color: #2f9e5f; opacity: 1; }
.ra-error { margin: -6px 0 0; font-size: 12px; color: #c53048; }
.ra-readonly { margin: 0; font-size: 12px; color: #b7791f; }
.ra-footer { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.ra-footer .ra-error { margin: 0; }
.ra-discard, .ra-save { padding: 7px 14px; border-radius: 7px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.ra-save { margin-left: auto; border: 0; background: #4c7dff; color: #fff; font-weight: 600; }
.ra-save:disabled { opacity: .5; cursor: default; }
.ra-discard:disabled { opacity: .4; cursor: default; }
`

/**
 * Whether this page is a local GUI (raw `location.hostname` check). This is
 * the only trustworthy local/remote signal in the browser: the edge
 * bootstrap pins `connection.isLoopback` to true on remote pages so the
 * settings plane works over the tunnel, so the connection service cannot be
 * used to tell the two apart.
 */
function isLoopbackPage(): boolean {
  const host = (globalThis as { location?: { hostname?: string } }).location?.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

/**
 * Required services (fiber inject waiting).
 */
export const inject = ['slots', 'settingsScope', 'locale', 'remote', 'remote.credentials']

/** The structural browser plugin context this apply consumes. */
interface ClientCtx {
  slots: {
    inject: (name: string, registration: () => void | Iterable<unknown>) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  settingsScope: { bind: (spec: { namespace: string }) => SettingsScopeFace }
  remote: { credentials: CredentialsFace }
  locale: {
    register: (ns: string, dictionaries: Record<string, Record<string, string>>) => void
    bind: (ns: string) => (key: string) => string
  }
  effect: (setup: () => unknown, label?: string) => void
}

/**
 * Mount the remote-access first-level settings section and the gated-401 redirect.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientCtx): void {
  const t = ctx.locale.bind(DICT_NS)
  ctx.effect(() => ctx.locale.register(DICT_NS, { zh, en }), 'remote-access: dictionaries')

  const scope = ctx.settingsScope.bind({ namespace: NS })
  // The edge bootstrap pins `connection.isLoopback` to true on remote pages
  // (that is what unlocks the settings plane), so the local/remote split must
  // use the raw page hostname instead — remote sessions are read-only.
  const remote = !isLoopbackPage()
  const controller = new CardController(scope, ctx.remote.credentials, remote, (line) => {
    console.warn(`[dsh-remote-access] ${line}`)
  })
  ctx.effect(() => () => { controller.dispose() }, 'remote-access: section controller')

  ctx.slots.inject('settings.section', () => {
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'remote-access',
        order: SECTION_ORDER,
        label: () => t('nav'),
        locale: DICT_NS,
        inject: () => controller.inject(),
      },
      RemoteAccessSection,
    )
  })

  // A gated 401 (session expired, or a first paint without a cookie) lands on the login page.
  ctx.effect(() => {
    if (typeof window === 'undefined' || isLoopbackPage()) return
    const originalFetch = window.fetch
    const wrapped = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      originalFetch(input, init).then((response) => {
        if (response.status !== 401) return response
        void response.clone().json().then((data) => {
          if (data !== null && typeof data === 'object' && (data as { code?: unknown }).code === 'login-required') {
            window.location.replace('/login')
          }
        }).catch(() => { /* not the gate's JSON */ })
        return response
      })
    window.fetch = wrapped
    return () => { window.fetch = originalFetch }
  }, 'remote-access: gated 401 redirect')
}

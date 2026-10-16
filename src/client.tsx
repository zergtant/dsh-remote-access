/**
 * dsh remote access — browser half (dsh 0.2.x).
 *
 * Mounts a first-level settings section ("远程访问") next to 通用设置/模型/插件,
 * and routes a gated 401 to the login page.
 *
 * 0.2.x contract notes:
 * - The removed `ctx.settingsScope` is replaced by `ctx.configForms`: one shared
 *   config form per Host profile entry, addressed by the entry id that also
 *   names the settings namespace (`remote-access`, the id of this plugin's patch
 *   row). The form carries the values, the namespace revision, the write queue,
 *   and the local/remote persistence decision, so nothing here re-implements
 *   describe/fence/recovery.
 * - `ctx.configForms.whileServed([NS], ...)` keeps the section registered only
 *   while the Host actually serves the namespace, so a deployment without the
 *   settings provider shows no trace of the page.
 * - Credentials read and write through `ctx.remote.credentials`, whose answers
 *   arrive in the Remote result envelope (`{ ok, value }`); the literal never
 *   rides a response.
 */

/** Settings namespace / profile entry id (the host half's patch row spells the same value). */
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

/** One path edit, as the shared config form's `mutate` accepts it. */
interface PathOp {
  op: 'set' | 'unset'
  path: string[]
  value?: unknown
}

/**
 * The shared config form this section stages over — `ctx.configForms.get(NS)`,
 * structurally (no cross-plugin value import).
 */
interface SettingsFormFace {
  getSnapshot: () => {
    status: 'loading' | 'ready' | 'unavailable'
    value?: { enabled?: boolean; tls?: boolean; port?: number; host?: string; username?: string }
    writable: boolean
    revision?: number
  }
  subscribe: (listener: () => void) => () => void
  set: (field: string, value: unknown) => Promise<boolean>
  mutate: (ops: PathOp[], expectedRevision?: number) => Promise<boolean>
}

/**
 * The credentials wire face: `ctx.remote.credentials`. Answers may arrive in
 * the Remote envelope (`{ ok, value | error }`); both shapes are accepted so a
 * refusal is reported as unconfigured instead of throwing.
 */
interface CredentialsFace {
  set: (ref: string, value: string) => Promise<unknown>
  describe: (refs: string[]) => Promise<unknown>
}

/** Unwrap one Remote result envelope, or pass a plain value through. */
function remoteValue<T>(response: unknown): T | undefined {
  if (response === null || typeof response !== 'object') return undefined
  const envelope = response as { ok?: unknown; value?: unknown }
  if (typeof envelope.ok === 'boolean') return envelope.ok ? envelope.value as T : undefined
  return response as T
}

/** Whether one credential write was accepted (the envelope may be absent). */
function remoteAccepted(response: unknown): boolean {
  if (response === null || typeof response !== 'object') return true
  const envelope = response as { ok?: unknown }
  return typeof envelope.ok === 'boolean' ? envelope.ok : true
}

/** The section's snapshot (the hook-compartment observable). */
interface RemoteAccessState {
  /** Whether the Host serves the namespace at all. */
  available: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  /**
   * Whether this document was served by the plugin's edge. Remote sessions are
   * read-only: committing a change would drop the very connection serving the
   * page. Taken from the marker the edge injects, not from the page hostname —
   * see {@link isEdgePage}.
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

/** The editable fields shared by the draft and the committed snapshot. */
type FieldSet = { enabled: boolean; tls: boolean; port: number; host: string; username: string }

/** The config field defaults, matching the host Config schema. */
const FIELD_DEFAULTS: FieldSet = { enabled: false, tls: true, port: 3081, host: '0.0.0.0', username: 'admin' }

/** The fields a save writes (the enable switch commits itself). */
const SAVED_FIELDS = ['tls', 'port', 'host', 'username'] as const

/**
 * Bridges the shared config form and the credentials wire onto the section state.
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
   * @param scope - the shared config form for the `remote-access` entry.
   * @param credentialsApi - the credentials wire face.
   * @param remote - whether the page is a remote edge session (read-only).
   * @param log - diagnostic sink.
   */
  constructor(
    private readonly scope: SettingsFormFace,
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
      enabled: value.enabled ?? FIELD_DEFAULTS.enabled,
      tls: value.tls ?? FIELD_DEFAULTS.tls,
      port: value.port ?? FIELD_DEFAULTS.port,
      host: value.host ?? FIELD_DEFAULTS.host,
      username: value.username ?? FIELD_DEFAULTS.username,
    }
  }

  private project(): RemoteAccessState {
    const snapshot = this.scope.getSnapshot()
    const portValid = parsePort(String(this.draft.port)) !== undefined
    return {
      available: snapshot.status === 'ready',
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
      const views = remoteValue<Record<string, { configured?: boolean }>>(response)
      // A refusal or error leaves the last-known state stale-unknown: the
      // badge reports unconfigured rather than claiming a password that the
      // Host may no longer hold.
      this.passwordConfigured = views?.[CREDENTIAL_REF]?.configured ?? false
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
      const accepted = await this.scope.set('enabled', next)
      if (!accepted || this.scope.getSnapshot().value?.enabled !== next) {
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
      const changes = SAVED_FIELDS.filter(key => before[key] !== desired[key])
      if (changes.length > 0) {
        // One revision-fenced commit avoids restarting the edge for each field.
        const accepted = await this.scope.mutate(changes.map(key => ({ op: 'set' as const, path: [key], value: desired[key] })))
        const committed = this.committedFromSnapshot()
        if (!accepted || changes.some(key => committed[key] !== desired[key])) {
          throw new Error('Host did not accept the settings change')
        }
      }
      if (this.password.trim().length > 0) {
        const response = await this.credentialsApi.set(CREDENTIAL_REF, this.password.trim())
        if (!remoteAccepted(response)) throw new Error('Host rejected the credential write')
        this.password = ''
      }
      this.committed = this.committedFromSnapshot()
      for (const key of SAVED_FIELDS) this.draft[key] = this.committed[key]
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
 * Whether this document was served by this plugin's edge — the only
 * trustworthy local/remote signal. A page hostname cannot answer it: the
 * desktop shell serves its own local window from `dsh-app://app/` (hostname
 * `app`, no loopback spelling), while the edge is remote whatever authority it
 * is reached by. The edge marks every document it serves from `<head>`, before
 * any client entry activates, so the marker is present exactly on remote pages.
 *
 * A missing marker therefore reads as LOCAL, which is the safe direction: a
 * false "local" only re-enables a card the user could reach anyway on that
 * machine, while a false "remote" would leave the desktop app unable to
 * configure the plugin at all.
 *
 * `connection.isLoopback` is deliberately not consulted: the trust bootstrap
 * pins it (and with it the settings plane's persistence mode) to true on remote
 * pages, so the connection service cannot tell the two apart.
 */
function isEdgePage(): boolean {
  return (globalThis as { __DSH_REMOTE_ACCESS_EDGE__?: unknown }).__DSH_REMOTE_ACCESS_EDGE__ === true
}

/**
 * Required services (fiber inject waiting). `configForms` is deliberately NOT
 * here: the settings section needs it, but the gated-401 redirect below does
 * not, so a deployment without the settings domain still gets the edge's login
 * behavior instead of a client entry that never activates.
 */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials']

/** The structural browser plugin context this apply consumes. */
interface ClientCtx {
  slots: {
    inject: (name: string, registration: () => void | Iterable<unknown>) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  configForms: {
    get: (entryId: string) => SettingsFormFace
    whileServed: (namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) => () => void
  }
  remote: { credentials: CredentialsFace }
  locale: {
    register: (ns: string, dictionaries: Record<string, Record<string, string>>) => void
    bind: (ns: string) => (key: string) => string
  }
  inject: (services: string[], callback: (scope: ClientCtx) => void) => void
  effect: (setup: () => unknown, label?: string) => void
}

/**
 * Mount the remote-access first-level settings section and the gated-401 redirect.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientCtx): void {
  const t = ctx.locale.bind(DICT_NS)
  ctx.effect(() => ctx.locale.register(DICT_NS, { zh, en }), 'remote-access: dictionaries')

  // A gated 401 (session expired, or a first paint without a cookie) lands on the login page.
  // Only an edge-served document has that page at all.
  ctx.effect(() => {
    if (typeof window === 'undefined' || !isEdgePage()) return
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

  // The settings domain may be absent from a stripped composition; the section
  // is optional, so it waits for the service instead of holding the entry back.
  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get(NS)
    // Remote sessions are read-only: committing a change would drop the very
    // connection serving the page. The edge marks its documents; every other
    // window (the loopback GUI, the desktop shell's `dsh-app://app/`) is local.
    const remote = isEdgePage()
    const controller = new CardController(scope, settingsCtx.remote.credentials, remote, (line) => {
      console.warn(`[dsh-remote-access] ${line}`)
    })
    settingsCtx.effect(() => () => { controller.dispose() }, 'remote-access: section controller')

    // The namespace exists only once the Host serves it (the settings provider
    // is composed), so the section follows the describe mirror instead of
    // assuming it.
    settingsCtx.effect(() => settingsCtx.configForms.whileServed([NS], () => settingsCtx.slots.inject('settings.section', () => {
      settingsCtx.slots.register(
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
    })), 'remote-access: settings section')
  })
}

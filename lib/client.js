window.__ModuleLoader__.load({
  id: "dsh-remote-access",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "remote-access";
var CREDENTIAL_REF = "DSH_REMOTE_ACCESS_PASSWORD";
var DICT_NS = "remote-access";
var SECTION_ORDER = 25;
var zh = {
  nav: "\u8FDC\u7A0B\u8BBF\u95EE",
  title: "dsh \u8FDC\u7A0B\u8BBF\u95EE",
  description: "TLS \u8FDC\u7A0B\u5165\u53E3\uFF1A\u767B\u5F55\u9875 + \u4F1A\u8BDD cookie\uFF0C\u900F\u660E\u4EE3\u7406\u5230\u672C\u673A GUI",
  statusRunning: "\u8FD0\u884C\u4E2D",
  statusStopped: "\u672A\u542F\u7528",
  start: "\u542F\u52A8",
  stop: "\u505C\u6B62",
  dirtyRunning: "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF1A\u5F53\u524D\u670D\u52A1\u4ECD\u6309\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E\u8FD0\u884C\uFF0C\u70B9\u300C\u4FDD\u5B58\u300D\u751F\u6548",
  dirtyStopped: "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF1A\u4FDD\u5B58\u540E\u624D\u4F1A\u751F\u6548",
  tls: "TLS\uFF08https\uFF0C\u81EA\u7B7E\u8BC1\u4E66\uFF09",
  tlsHint: "\u53D6\u6D88\u52FE\u9009\u5219\u4F7F\u7528\u660E\u6587 http\uFF08\u4EC5\u5185\u7F51/\u8C03\u8BD5\uFF09",
  noPasswordWarn: "\u5DF2\u542F\u7528\u4F46\u672A\u914D\u7F6E\u5BC6\u7801\uFF1A\u767B\u5F55\u4F1A\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u5148\u586B\u5199\u5BC6\u7801\u5E76\u4FDD\u5B58",
  port: "\u7AEF\u53E3",
  host: "\u76D1\u542C\u5730\u5740",
  username: "\u7528\u6237\u540D",
  password: "\u5BC6\u7801",
  passwordHint: "\u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8\uFF1B\u586B\u5199\u540E\u968F\u4FDD\u5B58\u66F4\u65B0",
  passwordConfigured: "\u5DF2\u914D\u7F6E",
  passwordMissing: "\u672A\u914D\u7F6E",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  discard: "\u653E\u5F03",
  readOnly: "\u5F53\u524D\u8BBE\u7F6E\u4E0D\u53EF\u5199",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  invalidPort: "\u7AEF\u53E3\u987B\u4E3A 1\u201365535 \u7684\u6574\u6570",
  invalidUsername: "\u7528\u6237\u540D\u4E0D\u80FD\u4E3A\u7A7A",
  hostAll: "\u6240\u6709\u7F51\u5361\uFF080.0.0.0\uFF09",
  hostLoop: "\u4EC5\u672C\u673A\uFF08127.0.0.1\uFF09",
  remoteReadOnly: "\u8FDC\u7A0B\u7AEF\u53EA\u8BFB\uFF1A\u4FEE\u6539\u914D\u7F6E\u4F1A\u7ACB\u5373\u4E2D\u65AD\u5F53\u524D\u4F1A\u8BDD\uFF0C\u8BF7\u5728\u672C\u673A 127.0.0.1 \u7684 GUI \u4E2D\u4FEE\u6539"
};
var en = {
  nav: "Remote Access",
  title: "dsh remote access",
  description: "TLS edge entry: login page + session cookie, proxied to the local GUI",
  statusRunning: "running",
  statusStopped: "stopped",
  start: "Start",
  stop: "Stop",
  dirtyRunning: "Unsaved changes: the running service still uses the saved configuration \u2014 save to apply",
  dirtyStopped: "Unsaved changes: applied only after you save",
  tls: "TLS (https, self-signed)",
  tlsHint: "Uncheck for plain http (LAN/debug only)",
  noPasswordWarn: "Enabled but no password configured: logins are rejected until one is saved",
  port: "Port",
  host: "Bind address",
  username: "Username",
  password: "Password",
  passwordHint: "Leave blank to keep; a typed value updates on save",
  passwordConfigured: "configured",
  passwordMissing: "not configured",
  save: "Save",
  saving: "Saving\u2026",
  discard: "Discard",
  readOnly: "Settings are not writable",
  saveFailed: "Save failed, retry",
  invalidPort: "Port must be an integer from 1 to 65535",
  invalidUsername: "Username cannot be empty",
  hostAll: "All interfaces (0.0.0.0)",
  hostLoop: "Loopback only (127.0.0.1)",
  remoteReadOnly: "Read-only while remote: changing settings drops this session \u2014 make changes in the local GUI on 127.0.0.1"
};
function createSnapshotSource(initial) {
  let value = initial;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener();
    }
  };
}
function parsePort(text) {
  if (!/^\d{1,5}$/.test(text)) return void 0;
  const value = Number(text);
  return value >= 1 && value <= 65535 ? value : void 0;
}
var CardController = class {
  /**
   * @param scope - the bound settings scope for the `remote-access` namespace.
   * @param credentialsApi - the credentials wire face.
   * @param remote - whether the page is a remote edge session (read-only).
   * @param log - diagnostic sink.
   */
  constructor(scope, credentialsApi, remote, log) {
    __publicField(this, "scope", scope);
    __publicField(this, "credentialsApi", credentialsApi);
    __publicField(this, "remote", remote);
    __publicField(this, "log", log);
    __publicField(this, "source");
    /** The last value the Host confirmed. */
    __publicField(this, "committed");
    /** What the controls show and edit. */
    __publicField(this, "draft");
    __publicField(this, "password", "");
    __publicField(this, "passwordConfigured", false);
    __publicField(this, "saving", false);
    __publicField(this, "failed", false);
    __publicField(this, "disposed", false);
    __publicField(this, "unsubscribeScope");
    this.committed = this.committedFromSnapshot();
    this.draft = { ...this.committed };
    this.source = createSnapshotSource(this.project());
    this.unsubscribeScope = scope.subscribe(() => {
      if (this.disposed) return;
      const next = this.committedFromSnapshot();
      for (const key of ["enabled", "tls", "port", "host", "username"]) {
        if (this.draft[key] === this.committed[key]) this.draft[key] = next[key];
      }
      this.committed = next;
      this.publish();
    });
    void this.readCredential();
  }
  committedFromSnapshot() {
    const value = this.scope.getSnapshot().value ?? {};
    return {
      enabled: value.enabled ?? false,
      tls: value.tls ?? true,
      port: value.port ?? 3081,
      host: value.host ?? "0.0.0.0",
      username: value.username ?? "admin"
    };
  }
  project() {
    const snapshot = this.scope.getSnapshot();
    const portValid = parsePort(String(this.draft.port)) !== void 0;
    return {
      available: snapshot.status !== "unavailable",
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
      dirty: this.password.length > 0 || this.draft.tls !== this.committed.tls || this.draft.port !== this.committed.port || this.draft.host !== this.committed.host || this.draft.username !== this.committed.username,
      invalid: !portValid || this.draft.username.length === 0
    };
  }
  publish() {
    this.source.set(this.project());
  }
  async readCredential() {
    const describe = this.credentialsApi.describe;
    if (describe === void 0) return;
    try {
      const response = await describe.call(this.credentialsApi, { refs: [CREDENTIAL_REF] });
      this.passwordConfigured = response?.result?.value?.credentials?.[CREDENTIAL_REF]?.configured ?? false;
    } catch (_readFailure) {
      this.passwordConfigured = false;
    }
    if (!this.disposed) this.publish();
  }
  /**
   * @param field - the draft field (the enable switch commits itself, not through here).
   * @param value - the raw control text (checkbox state as 'true'/'false').
   */
  setField(field, value) {
    if (this.disposed || this.saving || this.remote) return;
    if (field === "password") {
      this.password = value;
    } else if (field === "tls") {
      this.draft.tls = value === "true";
    } else if (field === "host") {
      this.draft.host = value;
    } else if (field === "username") {
      this.draft.username = value;
    } else {
      const parsed = parsePort(value);
      if (parsed !== void 0) this.draft.port = parsed;
      else this.draft.port = Number(value) || 0;
    }
    this.publish();
  }
  /** Commit the enable switch to the Host immediately (no save step). */
  async toggleEnabled(next) {
    if (this.disposed || this.saving || this.remote || this.committed.enabled === next) return;
    this.draft.enabled = next;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      await this.scope.set("enabled", next);
    } catch (toggleFailure) {
      this.log(`enable toggle failed: ${String(toggleFailure)}`);
      this.failed = true;
      this.draft.enabled = this.committed.enabled;
    } finally {
      this.saving = false;
      if (!this.disposed) this.publish();
    }
  }
  /** Write every staged difference (the enable switch is not one of them). */
  async save() {
    if (this.disposed || this.saving || this.remote) return;
    const state = this.project();
    if (state.invalid || !state.dirty) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      const before = this.committedFromSnapshot();
      if (before.tls !== this.draft.tls) await this.scope.set("tls", this.draft.tls);
      if (before.port !== this.draft.port) await this.scope.set("port", this.draft.port);
      if (before.host !== this.draft.host) await this.scope.set("host", this.draft.host);
      if (before.username !== this.draft.username) await this.scope.set("username", this.draft.username);
      if (this.password.trim().length > 0) {
        await this.credentialsApi.set({ ref: CREDENTIAL_REF, value: this.password.trim() });
        this.password = "";
      }
      this.committed = this.committedFromSnapshot();
      for (const key of ["tls", "port", "host", "username"]) this.draft[key] = this.committed[key];
      await this.readCredential();
    } catch (writeFailure) {
      this.log(`save failed: ${String(writeFailure)}`);
      this.failed = true;
    } finally {
      this.saving = false;
      if (!this.disposed) this.publish();
    }
  }
  /** Drop every staged edit; the controls follow the Host snapshot. */
  discard() {
    if (this.disposed || this.saving) return;
    this.password = "";
    this.failed = false;
    this.committed = this.committedFromSnapshot();
    this.draft = { ...this.committed };
    this.publish();
  }
  /** Stop following the scope. */
  dispose() {
    this.disposed = true;
    this.unsubscribeScope();
  }
  /** @returns the registration-side face. */
  inject() {
    return {
      hooks: {
        remoteAccess: {
          getSnapshot: this.source.getSnapshot,
          subscribe: this.source.subscribe
        }
      },
      setField: (field, value) => {
        this.setField(field, value);
      },
      toggleEnabled: (next) => this.toggleEnabled(next),
      save: () => this.save(),
      discard: () => this.discard()
    };
  }
};
function RemoteAccessSection(props) {
  const state = props.useRemoteAccess((snapshot) => snapshot);
  const t = props.t;
  if (!state.available) return null;
  const canWrite = state.writable && !state.remote;
  const saveBlocked = !state.dirty || state.saving || state.invalid || !canWrite;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ra-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: RA_PAGE_STYLES }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "ra-title", children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-lead", children: t("description") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ra-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: state.enabled ? "ra-stop" : "ra-start",
          disabled: !canWrite || state.saving,
          onClick: () => {
            void props.toggleEnabled(!state.enabled);
          },
          children: state.saving ? t("saving") : state.enabled ? t("stop") : t("start")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `ra-status${state.enabled ? " ra-status-on" : ""}`, role: "status", children: state.enabled ? `${t("statusRunning")} \xB7 ${state.committedTls ? "https" : "http"}://${state.committedHost}:${state.committedPort}` : t("statusStopped") })
    ] }),
    state.remote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-readonly", role: "status", children: t("remoteReadOnly") }) : null,
    !state.remote && !state.writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-readonly", role: "status", children: t("readOnly") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ra-row ra-row-check", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          className: "ra-check",
          checked: state.tls,
          disabled: !canWrite || state.saving,
          onChange: (event) => {
            props.setField("tls", event.target.checked ? "true" : "false");
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("tls") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-hint", children: t("tlsHint") }),
    state.enabled && !state.passwordConfigured ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-warn", role: "status", children: t("noPasswordWarn") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ra-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ra-label", children: t("port") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "ra-input",
          inputMode: "numeric",
          value: state.port,
          disabled: !canWrite || state.saving,
          onChange: (event) => {
            props.setField("port", event.target.value);
          }
        }
      )
    ] }),
    state.invalid && state.username.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-error", children: t("invalidPort") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ra-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ra-label", children: t("host") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "select",
        {
          className: "ra-input",
          value: state.host,
          disabled: !canWrite || state.saving,
          onChange: (event) => {
            props.setField("host", event.target.value);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "0.0.0.0", children: t("hostAll") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "127.0.0.1", children: t("hostLoop") })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ra-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ra-label", children: t("username") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "ra-input",
          value: state.username,
          disabled: !canWrite || state.saving,
          onChange: (event) => {
            props.setField("username", event.target.value);
          }
        }
      )
    ] }),
    state.username.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-error", children: t("invalidUsername") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ra-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "ra-label", children: [
        t("password"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { className: `ra-state${state.passwordConfigured ? " ra-state-ok" : ""}`, children: state.passwordConfigured ? t("passwordConfigured") : t("passwordMissing") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "ra-input",
          type: "password",
          autoComplete: "new-password",
          placeholder: t("passwordHint"),
          value: state.password,
          disabled: !canWrite || state.saving,
          onChange: (event) => {
            props.setField("password", event.target.value);
          }
        }
      )
    ] }),
    state.dirty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-dirty", role: "status", children: state.enabled ? t("dirtyRunning") : t("dirtyStopped") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ra-footer", children: [
      state.failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ra-error", role: "status", children: t("saveFailed") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "ra-discard",
          disabled: !state.dirty || state.saving,
          onClick: () => {
            props.discard();
          },
          children: t("discard")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "ra-save",
          disabled: saveBlocked,
          onClick: () => {
            void props.save();
          },
          children: state.saving ? t("saving") : t("save")
        }
      )
    ] })
  ] });
}
var RA_PAGE_STYLES = `
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
`;
function isLoopbackPage() {
  const host = globalThis.location?.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}
var inject = ["slots", "settingsScope", "connection", "locale"];
function apply(ctx) {
  const { api } = ctx.connection;
  const t = ctx.locale.bind(DICT_NS);
  ctx.effect(() => ctx.locale.register(DICT_NS, { zh, en }), "remote-access: dictionaries");
  const scope = ctx.settingsScope.bind({ namespace: NS });
  const remote = !isLoopbackPage();
  const controller = new CardController(scope, api.credentials, remote, (line) => {
    console.warn(`[dsh-remote-access] ${line}`);
  });
  ctx.effect(() => () => {
    controller.dispose();
  }, "remote-access: section controller");
  ctx.slots.inject("settings.section", () => {
    ctx.slots.register(
      {
        name: "settings.section",
        id: "remote-access",
        order: SECTION_ORDER,
        label: () => t("nav"),
        locale: DICT_NS,
        inject: () => controller.inject()
      },
      RemoteAccessSection
    );
  });
  ctx.effect(() => {
    if (typeof window === "undefined" || isLoopbackPage()) return;
    const originalFetch = window.fetch;
    const wrapped = (input, init) => originalFetch(input, init).then((response) => {
      if (response.status !== 401) return response;
      void response.clone().json().then((data) => {
        if (data !== null && typeof data === "object" && data.code === "login-required") {
          window.location.replace("/login");
        }
      }).catch(() => {
      });
      return response;
    });
    window.fetch = wrapped;
    return () => {
      window.fetch = originalFetch;
    };
  }, "remote-access: gated 401 redirect");
}

    return module.exports;
  }
});

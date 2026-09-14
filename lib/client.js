window.__ModuleLoader__.load({
  id: "dsh-uni-browser",
  factory: (require) => {
    const module = { exports: {} }; const exports = module.exports; const React = require("react"); const h = React.createElement; const inject = ["slots", "connection", "locale"];
    const SETTINGS_PATH = "/api/dsh-uni-browser";
    const NS = "dsh-uni-browser";
    const dictionaries = {
  "zh": {
    "loading": "读取中…",
    "working": "处理中…",
    "refresh": "刷新",
    "online": "在线",
    "offline": "离线",
    "copy": "复制",
    "copied": "已复制",
    "cancel": "取消",
    "title": "Uni Browser",
    "intro": "用独立浏览器配置保留各自的登录状态，方便在不同任务之间切换。",
    "runtime": "浏览器服务",
    "onlineHint": "本地服务已就绪，可以打开浏览器配置。",
    "offlineHint": "需要打开浏览器时，DSH 会自动启动本地服务。",
    "newProfile": "新建浏览器配置",
    "profileHint": "每个配置单独保存本地登录状态。",
    "name": "名称",
    "placeholder": "例如：资料研究",
    "engine": "浏览器引擎",
    "create": "创建",
    "profiles": "浏览器配置",
    "running": "运行中",
    "stopped": "已停止",
    "stop": "停止",
    "open": "打开",
    "forget": "删除配置",
    "forgetHint": "此配置的本地登录状态将被删除，且无法撤销。",
    "confirmForget": "确认删除",
    "empty": "还没有浏览器配置。创建一个即可开始。"
  },
  "en": {
    "loading": "Loading…",
    "working": "Working…",
    "refresh": "Refresh",
    "online": "Online",
    "offline": "Offline",
    "copy": "Copy",
    "copied": "Copied",
    "cancel": "Cancel",
    "title": "Uni Browser",
    "intro": "Keep separate browser profiles and their sign-in state for different tasks.",
    "runtime": "Browser service",
    "onlineHint": "The local service is ready to open a browser profile.",
    "offlineHint": "DSH starts the local service when a browser is needed.",
    "newProfile": "New browser profile",
    "profileHint": "Each profile keeps its own local sign-in state.",
    "name": "Name",
    "placeholder": "e.g. Research",
    "engine": "Browser engine",
    "create": "Create",
    "profiles": "Browser profiles",
    "running": "Running",
    "stopped": "Stopped",
    "stop": "Stop",
    "open": "Open",
    "forget": "Delete profile",
    "forgetHint": "This deletes the profile’s local sign-in state and cannot be undone.",
    "confirmForget": "Delete profile permanently",
    "empty": "No browser profiles yet. Create one to get started."
  }
};
    const styles = `.dshBrowserSettings { display:flex; flex-direction:column; gap:18px; max-width:720px; min-width:0; padding-bottom:24px; font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); }
.dshBrowserSettings * { box-sizing:border-box; }
.dshBrowserSettings h2 { margin:0; font-size:20px; line-height:28px; font-weight:600; }
.dshBrowserSettings h3 { margin:0; font-size:14px; line-height:20px; font-weight:600; }
.dshBrowserSettings p { margin:0; color:var(--dsw-alias-label-secondary); }
.dshBrowserSettings header p { margin-top:6px; }
.dshBrowserSettings .panel { padding:18px 20px; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-module-platform); display:flex; flex-direction:column; gap:14px; min-width:0; }
.dshBrowserSettings .row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.dshBrowserSettings .between { justify-content:space-between; }
.dshBrowserSettings .grow { flex:1; min-width:0; overflow-wrap:anywhere; }
.dshBrowserSettings .muted { color:var(--dsw-alias-label-secondary); font-size:12px; line-height:18px; }
.dshBrowserSettings .field { display:flex; flex-direction:column; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); min-width:0; }
.dshBrowserSettings :is(input,textarea,select) { min-width:0; max-width:100%; min-height:38px; padding:8px 10px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; line-height:20px; }
.dshBrowserSettings textarea { width:100%; resize:vertical; }
.dshBrowserSettings input { width:100%; }
.dshBrowserSettings button { display:inline-flex; align-items:center; justify-content:center; min-height:34px; padding:6px 14px; border:1px solid var(--dsw-alias-border-l2); border-radius:18px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; line-height:20px; cursor:pointer; }
.dshBrowserSettings button.primary { background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground); border-color:var(--dsw-alias-button-primary-fill); }
.dshBrowserSettings button.danger { color:var(--dsw-alias-state-error-primary); }
.dshBrowserSettings button:not(:disabled):not(.primary):hover { background:var(--dsw-alias-interactive-bg-hover); }
.dshBrowserSettings button:disabled { opacity:.45; cursor:default; }
.dshBrowserSettings :is(button,input,textarea,select,a):focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:2px; }
.dshBrowserSettings .alert { padding:10px 12px; border-left:2px solid var(--dsw-alias-state-error-primary); border-radius:4px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; font-size:13px; }
.dshBrowserSettings .list { display:flex; flex-direction:column; gap:10px; }
.dshBrowserSettings .list-item { display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-1); min-width:0; }
.dshBrowserSettings .name { font-size:14px; font-weight:500; overflow-wrap:anywhere; }
.dshBrowserSettings .code { font-family:ui-monospace,monospace; font-size:12px; line-height:18px; overflow-wrap:anywhere; }
.dshBrowserSettings .status { display:inline-flex; align-items:center; gap:6px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); }
.dshBrowserSettings .status::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; flex:0 0 auto; }
.dshBrowserSettings .status[data-state="online"],.dshBrowserSettings .status[data-state="running"] { color:var(--dsw-alias-state-success-primary); }
.dshBrowserSettings .status[data-state="connecting"] { color:var(--dsw-alias-state-warn-primary); }
.dshBrowserSettings .status[data-state="unpaired"] { color:var(--dsw-alias-state-error-primary); }
.dshBrowserSettings .empty { padding:10px 0; color:var(--dsw-alias-label-secondary); font-size:13px; }
.dshBrowserSettings .confirm { display:flex; flex-direction:column; gap:8px; padding-top:10px; border-top:1px solid var(--dsw-alias-border-l1); font-size:13px; }
`;
    function installStyles() {
      if (typeof document === "undefined") return;
      const style = document.createElement("style");
      style.dataset.plugin = NS;
      style.textContent = styles;
      document.head.appendChild(style);
      return () => style.remove();
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, dictionaries), `${NS}: dictionaries`);
      ctx.effect(installStyles, `${NS}: styles`);
      // The host route lives under `/api`, the one path Connection mounts and
      // fences; a per-plugin RPC channel is not served by this deployment.
      const call = async (endpoint, args = {}, signal) => { const response = await fetch(SETTINGS_PATH, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ endpoint, args }), signal }); if (!response.ok) throw new Error(`Browser request failed: HTTP ${response.status}`); const envelope = await response.json(); if (envelope?.ok !== true) throw new Error(envelope?.error?.message ?? "Browser request failed"); return envelope.value; };
      function BrowserSettings() {
        const [profiles, setProfiles] = React.useState([]);
        const [health, setHealth] = React.useState(null);
        const [loaded, setLoaded] = React.useState(false);
        const [name, setName] = React.useState("");
        const [engine, setEngine] = React.useState("chromium");
        const [error, setError] = React.useState("");
        const [working, setWorking] = React.useState(false);
        const [forgetting, setForgetting] = React.useState(null);
        const lifecycle = React.useRef({ controller: new AbortController(), busy: false });
        const refresh = React.useCallback(async (signal = lifecycle.current.controller.signal) => {
          const [profileResult, healthResult] = await Promise.all([call("profiles", {}, signal), call("health", {}, signal).catch((cause) => { signal.throwIfAborted(); return null; })]);
          signal.throwIfAborted(); setProfiles(profileResult.profiles ?? []); setHealth(healthResult); setLoaded(true); setError("");
        }, []);
        React.useEffect(() => {
          const controller = new AbortController(); lifecycle.current.controller = controller;
          void refresh(controller.signal).catch((cause) => { if (!controller.signal.aborted) { setError(String(cause.message ?? cause)); setLoaded(true); } });
          return () => controller.abort();
        }, [refresh]);
        const run = async (action) => {
          if (lifecycle.current.busy) return;
          const signal = lifecycle.current.controller.signal;
          lifecycle.current.busy = true; setWorking(true); setError("");
          try { await action(signal); await refresh(signal); }
          catch (cause) { if (!signal.aborted) setError(String(cause.message ?? cause)); }
          finally { lifecycle.current.busy = false; if (!signal.aborted) setWorking(false); }
        };
        const create = (event) => { event.preventDefault(); if (!name.trim()) return; void run(async (signal) => { await call("create", { name: name.trim(), engine, headless: false }, signal); setName(""); }); };
        const operate = (endpoint, id, confirm) => run(async (signal) => { await call(endpoint, { id, ...(confirm === undefined ? {} : { confirm }) }, signal); setForgetting(null); });
        return h("section", { className: "dshBrowserSettings", "aria-label": t("title") },
          h("header", null, h("h2", null, t("title")), h("p", null, t("intro"))),
          error ? h("p", { role: "alert", className: "alert" }, error) : null,
          h("section", { className: "panel" },
            h("div", { className: "row between" }, h("h3", null, t("runtime")), h("button", { type: "button", disabled: working, onClick: () => run(async () => {}) }, working ? t("working") : t("refresh"))),
            h("span", { className: "status", "data-state": health?.online ? "online" : "offline", role: "status" }, !loaded ? t("loading") : health?.online ? t("online") : t("offline")),
            h("p", { className: "muted" }, health?.online ? t("onlineHint") : t("offlineHint"))),
          h("section", { className: "panel" },
            h("h3", null, t("newProfile")), h("p", { className: "muted" }, t("profileHint")),
            h("form", { onSubmit: create, className: "row", style: { alignItems: "flex-end" } },
              h("label", { className: "field", style: { flex: "1 1 180px" } }, t("name"), h("input", { value: name, onChange: (event) => setName(event.target.value), placeholder: t("placeholder"), disabled: working })),
              h("label", { className: "field" }, t("engine"), h("select", { value: engine, onChange: (event) => setEngine(event.target.value), disabled: working }, h("option", { value: "chromium" }, "Chromium"), h("option", { value: "camoufox" }, "Camoufox"))),
              h("button", { type: "submit", disabled: working || !name.trim(), className: "primary" }, t("create")))),
          h("section", { className: "panel" },
            h("div", { className: "row between" }, h("h3", null, t("profiles")), loaded ? h("span", { className: "muted" }, profiles.length) : null),
            h("div", { className: "list" }, profiles.map((profile) => h("div", { key: profile.id, className: "list-item" },
              h("div", { className: "row between" }, h("div", { className: "grow" }, h("strong", { className: "name" }, profile.name),
                h("div", { className: "row muted" }, profile.engine, h("span", { className: "status", "data-state": profile.active ? "running" : "stopped" }, profile.active ? t("running") : t("stopped")))),
              h("div", { className: "row" }, h("button", { type: "button", disabled: working, onClick: () => operate(profile.active ? "close" : "open", profile.id) }, profile.active ? t("stop") : t("open")),
                h("button", { type: "button", disabled: working, className: "danger", onClick: () => setForgetting(profile.id) }, t("forget")))),
              forgetting === profile.id ? h("div", { className: "confirm", role: "group", "aria-label": t("forget") }, h("p", null, t("forgetHint")), h("div", { className: "row" },
                h("button", { type: "button", disabled: working, className: "danger", onClick: () => operate("forget", profile.id, true) }, t("confirmForget")), h("button", { type: "button", disabled: working, onClick: () => setForgetting(null) }, t("cancel")))) : null))),
            profiles.length === 0 ? h("p", { className: "empty", role: "status" }, loaded ? t("empty") : t("loading")) : null));
      }
      ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "uni-browser", order: 36, label: () => t("title") }, BrowserSettings)), `${NS}: settings`);
    }
    exports.apply = apply; exports.inject = inject; return module.exports;
  }
});

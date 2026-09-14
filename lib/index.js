import { createHash } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import net from "node:net";
import Schema from "@deepseek-ai/schemastery";
import { DAEMON_UNAVAILABLE, UniBrowserRuntime, daemonUnavailable, defaultRoot, insideRoot } from "./runtime.js";
import { registerBrowserChannel } from "./surface.js";

export { DAEMON_UNAVAILABLE, PLATFORM_PACKAGES, UNI_BROWSER_RUNTIME_VERSION, UniBrowserRuntime, daemonUnavailable, defaultRoot, platformPackageName } from "./runtime.js";
export { SETTINGS_PATH, createBrowserHandler, handleBrowserRequest, registerBrowserChannel } from "./surface.js";

export const name = "dsh-uni-browser";
export const inject = ["connection", "tools"];
export const Config = Schema.object({
  socketPath: Schema.string().min(1),
  requestTimeoutMs: Schema.number().min(100).max(120_000).default(10_000),
  maxResponseBytes: Schema.number().min(1_024).max(16 * 1024 * 1024).default(1024 * 1024),
  binaryPath: Schema.string().min(1),
  workspace: Schema.string().min(1),
  startupTimeoutMs: Schema.number().min(500).max(120_000).default(20_000),
  autoStart: Schema.boolean().default(true),
  defaultEngine: Schema.union(["camoufox", "chromium"]).default("chromium"),
  root: Schema.string().min(1),
  path: Schema.string().min(1),
  profilesRoot: Schema.string().min(1)
});

const safeId = (value) => {
  const text = String(value).trim().toLowerCase();
  const ascii = text.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Keep existing ASCII identifiers stable; pure Chinese and other Unicode names
  // get an ASCII directory/session key without discarding their display name.
  return ascii || (/[\p{L}\p{N}]/u.test(text) ? `profile-${createHash("sha256").update(text.normalize("NFC")).digest("hex").slice(0, 16)}` : "");
};

/** True for cases the daemon cannot answer, or the caller cancelled: documented silence, not a defect. */
const daemonUnreachable = (error) => error?.code === DAEMON_UNAVAILABLE || error?.code === "ABORT_ERR";

export class UniBrowserClient {
  constructor(config = {}) {
    this.socketPath = config.socketPath ?? process.env.UNI_BROWSER_SOCKET ?? join(process.env.XDG_RUNTIME_DIR ?? join(homedir(), ".uni-browser"), "uni.sock");
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
    this.maxResponseBytes = config.maxResponseBytes ?? 1024 * 1024;
  }
  async call(action, session = "default", params = {}, signal) {
    const id = crypto.randomUUID(); const request = `${JSON.stringify({ id, action, session, params })}\n`;
    return new Promise((resolve, reject) => {
      let buffer = ""; let bufferedBytes = 0; let settled = false;
      const socket = net.createConnection(this.socketPath);
      const cleanup = () => { socket.removeAllListeners(); socket.setTimeout(0); signal?.removeEventListener("abort", onAbort); };
      const fail = (error) => {
        if (settled) return;
        settled = true; cleanup(); socket.destroy();
        reject(error);
      };
      const unavailable = (reason) => fail(daemonUnavailable(`uni-browser daemon unavailable at ${this.socketPath}`, reason));
      const onAbort = () => fail(Object.assign(new Error(`${action} aborted before a response`), { name: "AbortError", code: "ABORT_ERR" }));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.setTimeout(this.requestTimeoutMs, () => unavailable(new Error("request timed out")));
      socket.once("error", (error) => unavailable(error));
      socket.once("end", () => unavailable(new Error("connection ended before a response")));
      socket.once("close", () => unavailable(new Error("connection closed before a response")));
      socket.on("connect", () => socket.write(request));
      socket.on("data", (chunk) => {
        bufferedBytes += chunk.byteLength;
        if (bufferedBytes > this.maxResponseBytes) return unavailable(new Error(`response exceeded ${this.maxResponseBytes} bytes`));
        buffer += chunk.toString("utf8"); let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (!line.trim()) continue;
          let response; try { response = JSON.parse(line); } catch { continue; }
          if (response.id !== id || typeof response.success !== "boolean") continue;
          settled = true; cleanup(); socket.destroy();
          if (response.success) resolve(response.data ?? {}); else reject(new Error(response.error ?? `uni-browser rejected ${action}`));
          return;
        }
      });
    });
  }
}

export class ProfileStore {
  constructor(config = {}) {
    this.root = resolve(config.root ?? defaultRoot());
    this.path = resolve(this.root, config.path ?? "profiles.json");
    this.profilesRoot = resolve(this.root, config.profilesRoot ?? "profiles");
    for (const [key, value] of [["path", this.path], ["profilesRoot", this.profilesRoot]]) {
      if (!insideRoot(value, this.root)) throw new Error(`uni-browser ${key} must stay inside the plugin root ${this.root}: ${value}`);
    }
    this.defaultEngine = config.defaultEngine ?? "chromium";
    this.state = { version: 1, profiles: [] };
    this.loadError = undefined;
    // The initial load is owned here, not by the caller: a damaged state file
    // must never surface as an unhandled rejection that exits the harness.
    this.ready = this.#load().catch((cause) => {
      this.loadError = new Error(`uni-browser profile registry at ${this.path} could not be loaded: ${cause.message}`);
    });
    this.saveTail = Promise.resolve();
  }
  async #load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      if (parsed?.version === 1 && Array.isArray(parsed.profiles)) {
        this.state = parsed;
        await mkdir(this.root, { recursive: true, mode: 0o700 }); await chmod(this.root, 0o700);
        // Only registry paths under the plugin root are narrowed; an arbitrary
        // configured parent (say /tmp) keeps its own mode.
        await chmod(dirname(this.path), 0o700);
        await chmod(this.path, 0o600);
      }
    } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  async #save() {
    const snapshot = `${JSON.stringify(this.state, null, 2)}\n`;
    const save = this.saveTail.then(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 }); await chmod(this.root, 0o700);
      const parent = dirname(this.path);
      await mkdir(parent, { recursive: true, mode: 0o700 }); await chmod(parent, 0o700);
      const temp = `${this.path}.${crypto.randomUUID()}.tmp`;
      await writeFile(temp, snapshot, { mode: 0o600 }); await chmod(temp, 0o600);
      await rename(temp, this.path); await chmod(this.path, 0o600);
    });
    this.saveTail = save.catch(() => {});
    return save;
  }
  /** Await the initial load and rethrow its recorded failure against the state file named in it. */
  async whenReady() { await this.ready; if (this.loadError) throw this.loadError; }
  async list() { await this.whenReady(); return this.state.profiles.map((profile) => ({ ...profile })); }
  async create({ name, engine = this.defaultEngine, headless = false }) {
    await this.whenReady(); const id = safeId(name); if (!id) throw new Error("profile name must contain letters or numbers");
    if (!["camoufox", "chromium"].includes(engine)) throw new Error("engine must be camoufox or chromium");
    if (this.state.profiles.some((profile) => profile.id === id)) throw new Error(`profile ${id} already exists`);
    const profile = { id, name: String(name).trim(), engine, headless: Boolean(headless), session: `dsh-${id}`, createdAt: Date.now() };
    this.state.profiles.push(profile); await this.#save(); return { ...profile };
  }
  async get(id) { await this.whenReady(); const profile = this.state.profiles.find((item) => item.id === safeId(id)); if (!profile) throw new Error(`unknown browser profile: ${id}`); return profile; }
  profileDir(profile) { return join(this.profilesRoot, profile.id); }
  async forget(id) { await this.whenReady(); const profile = await this.get(id); await rm(this.profileDir(profile), { recursive: true, force: true }); this.state.profiles = this.state.profiles.filter((item) => item.id !== profile.id); await this.#save(); return profile; }
}

export class DshUniBrowser {
  constructor(config = {}) {
    this.runtime = config.runtime ?? (config.client ? undefined : new UniBrowserRuntime(config));
    this.client = config.client ?? new UniBrowserClient({ ...config, socketPath: this.runtime.socketPath });
    this.store = config.store ?? new ProfileStore(config);
    this.logger = config.logger ?? console;
  }
  async call(action, session = "default", params = {}, signal) { if (this.runtime) await this.runtime.ensure(this.client); return this.client.call(action, session, params, signal); }
  async stop() { return this.runtime ? this.runtime.stop() : false; }
  async health(signal) { const data = await this.call("daemon.ping", "default", {}, signal); return { online: Boolean(data.pong), socketPath: this.client.socketPath, managed: Boolean(this.runtime?.managed), runtimeSource: this.runtime?.runtimeSource ?? "injected-client" }; }
  async profiles(signal) {
    const profiles = await this.store.list(); let active = new Set(); let online = false;
    try {
      const data = await this.call("session.list", "default", {}, signal); active = new Set((data.sessions ?? []).map(String)); online = true;
    } catch (error) {
      // Swallowed only when no daemon answered: the registry is still useful
      // and nothing changed. Any other failure is a real defect and is logged.
      if (!daemonUnreachable(error)) this.logger.warn?.(`dsh-uni-browser: session.list failed: ${error?.message ?? error}`);
    }
    return profiles.map((profile) => ({ ...profile, active: active.has(profile.session), daemonOnline: online }));
  }
  async create(input) { return this.store.create(input); }
  async open(id, signal) {
    const profile = await this.store.get(id); const profileDir = this.store.profileDir(profile);
    await mkdir(this.store.profilesRoot, { recursive: true, mode: 0o700 }); await chmod(this.store.profilesRoot, 0o700);
    await mkdir(profileDir, { recursive: true, mode: 0o700 }); await chmod(profileDir, 0o700);
    const data = await this.call("session.create", profile.session, { engine: profile.engine, headless: profile.headless, user_data_dir: profileDir, audit: true }, signal); return { profile, data };
  }
  async close(id, signal) { const profile = await this.store.get(id); const data = await this.call("session.close", profile.session, { purge: false }, signal); return { profile, data }; }
  async forget(id, confirm, signal) {
    if (confirm !== true) throw new Error("forgetting a profile permanently deletes its login state; pass confirm: true");
    const profile = await this.store.get(id);
    try {
      await this.call("session.close", profile.session, { purge: false }, signal);
    } catch (error) {
      // Swallowed only when no daemon answered: nothing was closed, and the
      // local profile directory is still deleted below. Anything else is logged.
      if (!daemonUnreachable(error)) this.logger.warn?.(`dsh-uni-browser: session.close before forget failed: ${error?.message ?? error}`);
    }
    return this.store.forget(profile.id);
  }
  async action(id, action, params = {}, signal) { const profile = await this.store.get(id); return this.call(action, profile.session, params, signal); }
}

const profileOutput = { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string", required: true }, name: { type: "string", required: true }, engine: { type: "string", required: true }, session: { type: "string", required: true } } }, render: (_args, value) => [{ type: "text", text: `${value.name} (${value.engine})` }] };

export function apply(ctx, config) {
  const browser = new DshUniBrowser({ ...config, logger: ctx.logger("dsh-uni-browser") }); ctx.provide("dshUniBrowser", browser);
  // Own the daemon this plugin spawned: unload and HMR must not orphan it, and
  // a daemon that was already running is never signalled.
  ctx.effect(() => () => browser.stop(), "dsh-uni-browser: managed daemon");
  ctx.inject(["webServer"], () => {
    // The card's route lives under `/api`, the one path Connection mounts and
    // fences on this deployment; a per-plugin RPC channel is not served here.
    registerBrowserChannel(ctx, browser);
  });
  ctx.tools.register(defineTool({ name: "uni_browser_profiles", description: "List registered persistent uni-browser profiles. Use a profile id explicitly before browser actions.", parameters: {}, output: { schema: { type: "array", items: { type: "object", additionalProperties: true } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }, async execute(_args, exec) { return browser.profiles(exec?.signal); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_profile_create", description: "Register a named persistent browser profile. The user logs in manually after opening it; no passwords or cookies are supplied to this tool.", parameters: { name: { type: "string", required: true }, engine: { type: "string", description: "chromium or camoufox; defaults to chromium." }, headless: { type: "boolean", description: "Use false when a human must log in visibly." } }, output: profileOutput, async execute(args) { return browser.create(args); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_open", description: "Start a registered browser profile and restore its local login state. Use a headed profile for human login or approval flows.", parameters: { profile: { type: "string", required: true } }, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: `Opened ${value.profile.name}` }] }, async execute(args, exec) { return browser.open(args.profile, exec?.signal); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_close", description: "Stop a browser profile without deleting its cookies or other persistent login state.", parameters: { profile: { type: "string", required: true } }, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: `Stopped ${value.profile.name}; profile data remains.` }] }, async execute(args, exec) { return browser.close(args.profile, exec?.signal); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_forget", description: "Permanently delete a browser profile and all of its local login state. Use only after the user explicitly asks to forget it.", parameters: { profile: { type: "string", required: true }, confirm: { type: "boolean", required: true } }, output: profileOutput, async execute(args, exec) { return browser.forget(args.profile, args.confirm, exec?.signal); } }));
  for (const [name, action, parameters, description] of [
    ["uni_browser_navigate", "page.navigate", { profile: { type: "string", required: true }, url: { type: "string", required: true } }, "Navigate an open browser profile to a URL."],
    ["uni_browser_snapshot", "page.snapshot", { profile: { type: "string", required: true } }, "Read the accessibility snapshot of an open browser profile."],
    ["uni_browser_click", "page.click", { profile: { type: "string", required: true }, selector: { type: "string", required: true }, humanized: { type: "boolean" } }, "Click a CSS selector in an open browser profile."],
    ["uni_browser_type", "page.type", { profile: { type: "string", required: true }, selector: { type: "string", required: true }, text: { type: "string", required: true }, humanized: { type: "boolean" } }, "Type text into a CSS selector in an open browser profile."],
    ["uni_browser_press", "page.press", { profile: { type: "string", required: true }, key: { type: "string", required: true } }, "Press a key in an open browser profile."]
  ]) ctx.tools.register(defineTool({ name, description, parameters, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }, async execute(args, exec) { const { profile, ...params } = args; return browser.action(profile, action, params, exec?.signal); } }));
}

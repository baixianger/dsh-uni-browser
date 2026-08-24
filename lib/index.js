import { defineTool } from "@deepseek-ai/dsh-tools";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import net from "node:net";
import Schema from "@deepseek-ai/schemastery";

export const name = "dsh-uni-browser";
export const inject = ["connection", "tools"];
export const Config = Schema.object({
  socketPath: Schema.string(),
  requestTimeoutMs: Schema.number().min(100).max(120_000).default(10_000),
  maxResponseBytes: Schema.number().min(1_024).max(16 * 1024 * 1024).default(1024 * 1024),
  root: Schema.string(),
  path: Schema.string(),
  profilesRoot: Schema.string()
});

const safeId = (value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export class UniBrowserClient {
  constructor(config = {}) {
    this.socketPath = config.socketPath ?? process.env.UNI_BROWSER_SOCKET ?? join(process.env.XDG_RUNTIME_DIR ?? join(homedir(), ".uni-browser"), "uni.sock");
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
    this.maxResponseBytes = config.maxResponseBytes ?? 1024 * 1024;
  }
  async call(action, session = "default", params = {}) {
    const id = crypto.randomUUID(); const request = `${JSON.stringify({ id, action, session, params })}\n`;
    return new Promise((resolve, reject) => {
      let buffer = ""; let bufferedBytes = 0; let settled = false;
      const socket = net.createConnection(this.socketPath);
      const cleanup = () => { socket.removeAllListeners(); socket.setTimeout(0); };
      const fail = (error) => {
        if (settled) return;
        settled = true; cleanup(); socket.destroy();
        reject(new Error(`uni-browser daemon unavailable at ${this.socketPath}: ${error.message}`));
      };
      socket.setTimeout(this.requestTimeoutMs, () => fail(new Error("request timed out")));
      socket.once("error", fail);
      socket.once("end", () => fail(new Error("connection ended before a response")));
      socket.once("close", () => fail(new Error("connection closed before a response")));
      socket.on("connect", () => socket.write(request));
      socket.on("data", (chunk) => {
        bufferedBytes += chunk.byteLength;
        if (bufferedBytes > this.maxResponseBytes) return fail(new Error(`response exceeded ${this.maxResponseBytes} bytes`));
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
    this.root = config.root ?? join(homedir(), ".dsh", "dsh-uni-browser");
    this.path = config.path ?? join(this.root, "profiles.json");
    this.profilesRoot = config.profilesRoot ?? join(this.root, "profiles");
    this.state = { version: 1, profiles: [] }; this.ready = this.#load(); this.saveTail = Promise.resolve();
  }
  async #load() { try { const parsed = JSON.parse(await readFile(this.path, "utf8")); if (parsed?.version === 1 && Array.isArray(parsed.profiles)) { this.state = parsed; await mkdir(this.root, { recursive: true, mode: 0o700 }); await chmod(this.root, 0o700); await chmod(dirname(this.path), 0o700); await chmod(this.path, 0o600); } } catch (error) { if (error?.code !== "ENOENT") throw error; } }
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
  async list() { await this.ready; return this.state.profiles.map((profile) => ({ ...profile })); }
  async create({ name, engine = "camoufox", headless = false }) {
    await this.ready; const id = safeId(name); if (!id) throw new Error("profile name must contain letters or numbers");
    if (!["camoufox", "chromium"].includes(engine)) throw new Error("engine must be camoufox or chromium");
    if (this.state.profiles.some((profile) => profile.id === id)) throw new Error(`profile ${id} already exists`);
    const profile = { id, name: String(name).trim(), engine, headless: Boolean(headless), session: `dsh-${id}`, createdAt: Date.now() };
    this.state.profiles.push(profile); await this.#save(); return { ...profile };
  }
  async get(id) { await this.ready; const profile = this.state.profiles.find((item) => item.id === safeId(id)); if (!profile) throw new Error(`unknown browser profile: ${id}`); return profile; }
  profileDir(profile) { return join(this.profilesRoot, profile.id); }
  async forget(id) { await this.ready; const profile = await this.get(id); await rm(this.profileDir(profile), { recursive: true, force: true }); this.state.profiles = this.state.profiles.filter((item) => item.id !== profile.id); await this.#save(); return profile; }
}

export class DshUniBrowser {
  constructor(config = {}) { this.client = config.client ?? new UniBrowserClient(config); this.store = config.store ?? new ProfileStore(config); }
  async health() { const data = await this.client.call("daemon.ping"); return { online: Boolean(data.pong), socketPath: this.client.socketPath }; }
  async profiles() {
    const profiles = await this.store.list(); let active = new Set(); let online = false;
    try { const data = await this.client.call("session.list"); active = new Set((data.sessions ?? []).map(String)); online = true; } catch {}
    return profiles.map((profile) => ({ ...profile, active: active.has(profile.session), daemonOnline: online }));
  }
  async create(input) { return this.store.create(input); }
  async open(id) {
    const profile = await this.store.get(id); const profileDir = this.store.profileDir(profile);
    await mkdir(this.store.profilesRoot, { recursive: true, mode: 0o700 }); await chmod(this.store.profilesRoot, 0o700);
    await mkdir(profileDir, { recursive: true, mode: 0o700 }); await chmod(profileDir, 0o700);
    const data = await this.client.call("session.create", profile.session, { engine: profile.engine, headless: profile.headless, user_data_dir: profileDir, audit: true }); return { profile, data };
  }
  async close(id) { const profile = await this.store.get(id); const data = await this.client.call("session.close", profile.session, { purge: false }); return { profile, data }; }
  async forget(id, confirm) { if (confirm !== true) throw new Error("forgetting a profile permanently deletes its login state; pass confirm: true"); const profile = await this.store.get(id); try { await this.client.call("session.close", profile.session, { purge: false }); } catch {} return this.store.forget(profile.id); }
  async action(id, action, params = {}) { const profile = await this.store.get(id); return this.client.call(action, profile.session, params); }
}

const profileOutput = { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string", required: true }, name: { type: "string", required: true }, engine: { type: "string", required: true }, session: { type: "string", required: true } } }, render: (_args, value) => [{ type: "text", text: `${value.name} (${value.engine})` }] };

export function apply(ctx, config) {
  const browser = new DshUniBrowser(config); ctx.provide("dshUniBrowser", browser);
  ctx.connection.rpc.handle("/dsh-uni-browser", async (endpoint, payload) => {
    const args = payload?.args ?? {};
    if (endpoint === "health") return { ok: true, value: await browser.health() };
    if (endpoint === "profiles") return { ok: true, value: { profiles: await browser.profiles() } };
    if (endpoint === "create") return { ok: true, value: await browser.create(args) };
    if (endpoint === "open") return { ok: true, value: await browser.open(args.id) };
    if (endpoint === "close") return { ok: true, value: await browser.close(args.id) };
    if (endpoint === "forget") return { ok: true, value: await browser.forget(args.id, args.confirm) };
    throw new Error(`unknown dsh-uni-browser endpoint: ${endpoint}`);
  }, { authority: "trusted-host" });
  ctx.tools.register(defineTool({ name: "uni_browser_profiles", description: "List registered persistent uni-browser profiles. Use a profile id explicitly before browser actions.", parameters: {}, output: { schema: { type: "array", items: { type: "object", additionalProperties: true } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }, async execute() { return browser.profiles(); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_profile_create", description: "Register a named persistent browser profile. The user logs in manually after opening it; no passwords or cookies are supplied to this tool.", parameters: { name: { type: "string", required: true }, engine: { type: "string", description: "camoufox or chromium; defaults to camoufox." }, headless: { type: "boolean", description: "Use false when a human must log in visibly." } }, output: profileOutput, async execute(args) { return browser.create(args); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_open", description: "Start a registered browser profile and restore its local login state. Use a headed profile for human login or approval flows.", parameters: { profile: { type: "string", required: true } }, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: `Opened ${value.profile.name}` }] }, async execute(args) { return browser.open(args.profile); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_close", description: "Stop a browser profile without deleting its cookies or other persistent login state.", parameters: { profile: { type: "string", required: true } }, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: `Stopped ${value.profile.name}; profile data remains.` }] }, async execute(args) { return browser.close(args.profile); } }));
  ctx.tools.register(defineTool({ name: "uni_browser_forget", description: "Permanently delete a browser profile and all of its local login state. Use only after the user explicitly asks to forget it.", parameters: { profile: { type: "string", required: true }, confirm: { type: "boolean", required: true } }, output: profileOutput, async execute(args) { return browser.forget(args.profile, args.confirm); } }));
  for (const [name, action, parameters, description] of [
    ["uni_browser_navigate", "page.navigate", { profile: { type: "string", required: true }, url: { type: "string", required: true } }, "Navigate an open browser profile to a URL."],
    ["uni_browser_snapshot", "page.snapshot", { profile: { type: "string", required: true } }, "Read the accessibility snapshot of an open browser profile."],
    ["uni_browser_click", "page.click", { profile: { type: "string", required: true }, selector: { type: "string", required: true }, humanized: { type: "boolean" } }, "Click a CSS selector in an open browser profile."],
    ["uni_browser_type", "page.type", { profile: { type: "string", required: true }, selector: { type: "string", required: true }, text: { type: "string", required: true }, humanized: { type: "boolean" } }, "Type text into a CSS selector in an open browser profile."],
    ["uni_browser_press", "page.press", { profile: { type: "string", required: true }, key: { type: "string", required: true } }, "Press a key in an open browser profile."]
  ]) ctx.tools.register(defineTool({ name, description, parameters, output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }, async execute(args) { const { profile, ...params } = args; return browser.action(profile, action, params); } }));
}

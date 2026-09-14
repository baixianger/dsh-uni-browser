import assert from "node:assert/strict";
import net from "node:net";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { apply, Config, daemonUnavailable, defaultRoot, DshUniBrowser, platformPackageName, ProfileStore, UniBrowserClient, UniBrowserRuntime } from "../lib/index.js";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function applyContext(tools = [], effects = [], routes = []) {
  return {
    logger: () => ({ warn() {} }),
    provide() {},
    effect(execute, label) { const dispose = execute(); effects.push({ label, dispose }); return dispose; },
    inject(_services, callback) { callback(this); },
    connection: { fetch: { register(route) { routes.push(route); return () => {}; } } },
    tools: { register(tool) { tools.push(tool); } }
  };
}

test("profile registry defaults new profiles to Chromium", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const store = new ProfileStore({ root });
  const profile = await store.create({ name: "Research Camoufox" });
  assert.deepEqual(profile, { id: "research-camoufox", name: "Research Camoufox", engine: "chromium", headless: false, session: "dsh-research-camoufox", createdAt: profile.createdAt });
  assert.equal(store.profileDir(profile), join(root, "profiles", "research-camoufox"));
  assert.equal((await store.list()).length, 1);
});

test("config keeps its defaults and rejects empty paths and unknown engines", () => {
  assert.equal(Config({}).defaultEngine, "chromium");
  assert.equal(Config({ defaultEngine: "camoufox" }).defaultEngine, "camoufox");
  for (const key of ["socketPath", "binaryPath", "workspace", "root", "path", "profilesRoot"]) assert.throws(() => Config({ [key]: "" }), /string length/);
  assert.throws(() => Config({ defaultEngine: "firefox" }));
});

test("runtime package names are deterministic for every supported target", () => {
  assert.equal(platformPackageName("darwin", "arm64"), "dsh-uni-browser-darwin-arm64");
  assert.equal(platformPackageName("darwin", "x64"), "dsh-uni-browser-darwin-x64");
  assert.equal(platformPackageName("linux", "arm64"), "dsh-uni-browser-linux-arm64");
  assert.equal(platformPackageName("linux", "x64"), "dsh-uni-browser-linux-x64");
  assert.throws(() => platformPackageName("win32", "x64"), /does not provide/);
});

test("the plugin root follows DSH_HOME before the OS home", async () => {
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = await mkdtemp(join(tmpdir(), "dsh-uni-browser-home-"));
  try {
    assert.equal(new ProfileStore().root, join(process.env.DSH_HOME, "dsh-uni-browser"));
    assert.equal(new UniBrowserRuntime().root, join(process.env.DSH_HOME, "dsh-uni-browser"));
    assert.deepEqual(await new ProfileStore().list(), []);
  } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; }
  assert.equal(defaultRoot({}), join(homedir(), ".dsh", "dsh-uni-browser"));
});

test("managed runtime serializes concurrent daemon startup", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-runtime-"));
  let online = false; let spawns = 0;
  const child = new EventEmitter(); child.exitCode = null; child.unref = () => {};
  const runtime = new UniBrowserRuntime({
    root,
    binaryPath: "/bin/echo",
    spawnProcess() { spawns += 1; return child; },
    async wait() { online = true; }
  });
  const client = { async call() { if (!online) throw new Error("offline"); return { pong: true }; } };
  const [first, second] = await Promise.all([runtime.ensure(client), runtime.ensure(client)]);
  assert.equal(spawns, 1);
  assert.equal(first.started, true);
  assert.equal(second.started, true);
  assert.equal(first.socketPath, join(root, "daemon", "uni.sock"));
});

test("the runtime owns the daemon it started and never signals one found running", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-stop-"));
  let online = false; const signals = [];
  const child = new EventEmitter(); child.exitCode = null; child.pid = 4321; child.unref = () => {};
  child.kill = (signal) => { signals.push(signal); child.exitCode = 0; child.emit("exit", 0, signal); return true; };
  const runtime = new UniBrowserRuntime({ root, binaryPath: "/bin/echo", spawnProcess: () => child, async wait() { online = true; } });
  const client = { async call() { if (!online) throw new Error("offline"); return { pong: true }; } };
  assert.equal((await runtime.ensure(client)).started, true);
  assert.equal(runtime.started, true);
  assert.equal(await runtime.stop(), true);
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(runtime.started, false);
  assert.equal(await runtime.stop(), false);

  let spawns = 0;
  const running = new UniBrowserRuntime({ root, spawnProcess() { spawns += 1; } });
  assert.equal((await running.ensure({ async call() { return { pong: true }; } })).started, false);
  assert.equal(await running.stop(), false);
  assert.equal(spawns, 0);
});

test("the runtime refuses to start a second daemon while one is alive", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-double-"));
  let spawns = 0;
  const child = new EventEmitter(); child.exitCode = null; child.unref = () => {};
  const runtime = new UniBrowserRuntime({
    root,
    binaryPath: "/bin/echo",
    startupTimeoutMs: 20,
    spawnProcess() { spawns += 1; return child; },
    async wait() {}
  });
  const offline = { async call() { throw new Error("offline"); } };
  await assert.rejects(() => runtime.ensure(offline), /did not become ready/);
  await assert.rejects(() => runtime.ensure(offline), /already running/);
  assert.equal(spawns, 1);
});

test("stopping a daemon that ignores SIGTERM escalates to SIGKILL", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-kill-"));
  let online = false; const signals = [];
  const child = new EventEmitter(); child.exitCode = null; child.unref = () => {};
  child.kill = (signal) => { signals.push(signal); if (signal === "SIGKILL") { child.exitCode = 137; child.emit("exit", null, signal); } return true; };
  const runtime = new UniBrowserRuntime({ root, binaryPath: "/bin/echo", stopGraceMs: 10, spawnProcess: () => child, async wait() { online = true; } });
  await runtime.ensure({ async call() { if (!online) throw new Error("offline"); return { pong: true }; } });
  assert.equal(await runtime.stop(), true);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("the spawned daemon inherits an allowlisted environment, never harness credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-env-"));
  const previousKey = process.env.OPENAI_API_KEY; const previousSession = process.env.DSH_SESSION_ID;
  process.env.OPENAI_API_KEY = "sk-test-credential"; process.env.DSH_SESSION_ID = "session-must-not-leak";
  let captured; let online = false;
  const child = new EventEmitter(); child.exitCode = null; child.unref = () => {};
  const runtime = new UniBrowserRuntime({ root, binaryPath: "/bin/echo", spawnProcess(_binary, _args, options) { captured = options; return child; }, async wait() { online = true; } });
  try {
    await runtime.ensure({ async call() { if (!online) throw new Error("offline"); return { pong: true }; } });
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousSession === undefined) delete process.env.DSH_SESSION_ID; else process.env.DSH_SESSION_ID = previousSession;
  }
  assert.equal(captured.env.PATH, process.env.PATH);
  assert.equal(captured.env.OPENAI_API_KEY, undefined);
  assert.equal(captured.env.DSH_SESSION_ID, undefined);
  assert.equal(captured.env.UNI_BROWSER_WORKSPACE, join(root, "daemon"));
  assert.equal(captured.env.UNI_BROWSER_SOCKET, join(root, "daemon", "uni.sock"));
});

test("an external workspace keeps its own mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-workspace-root-"));
  const workspace = await mkdtemp(join(tmpdir(), "dsh-uni-browser-workspace-")); await chmod(workspace, 0o755);
  let online = false;
  const child = new EventEmitter(); child.exitCode = null; child.unref = () => {};
  const runtime = new UniBrowserRuntime({ root, workspace, binaryPath: "/bin/echo", spawnProcess: () => child, async wait() { online = true; } });
  await runtime.ensure({ async call() { if (!online) throw new Error("offline"); return { pong: true }; } });
  assert.equal((await stat(workspace)).mode & 0o777, 0o755);
});

test("an installed but unusable platform runtime fails loudly instead of falling back to PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-unusable-"));
  const packaged = join(root, "uni-browser"); await writeFile(packaged, "#!/bin/sh\nexit 0\n", { mode: 0o644 });
  const runtime = new UniBrowserRuntime({ root, resolvePackage: () => packaged });
  await assert.rejects(() => runtime.resolveBinary(), /runtime is unusable/);
  await assert.rejects(() => runtime.resolveBinary(), new RegExp(escapeRegExp(packaged)));
});

test("a genuinely absent packaged runtime still falls back to PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-path-"));
  const system = join(root, "uni-browser"); await writeFile(system, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const previous = process.env.PATH; process.env.PATH = root;
  try {
    const runtime = new UniBrowserRuntime({ root, resolvePackage() { const error = new Error("Cannot find module"); error.code = "MODULE_NOT_FOUND"; throw error; } });
    assert.equal(await runtime.resolveBinary(), system);
    assert.equal(runtime.runtimeSource, "system-path");
  } finally { if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous; }
});

test("explicit socket remains externally managed and never starts a daemon", async () => {
  let spawns = 0;
  const runtime = new UniBrowserRuntime({ socketPath: "/tmp/external-uni.sock", spawnProcess() { spawns += 1; } });
  await assert.rejects(() => runtime.ensure({ async call() { throw new Error("offline"); } }), /externally managed/);
  assert.equal(spawns, 0);
});

test("client sends a uni-browser NDJSON action over a Unix socket", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const socketPath = join(root, "uni.sock");
  const server = net.createServer((socket) => socket.on("data", (chunk) => { const request = JSON.parse(chunk.toString("utf8")); socket.end(`${JSON.stringify({ id: request.id, success: true, data: { pong: true } })}\n`); }));
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try { assert.deepEqual(await new UniBrowserClient({ socketPath }).call("daemon.ping"), { pong: true }); } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("client rejects promptly when the daemon closes before responding", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const socketPath = join(root, "uni.sock");
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    await assert.rejects(() => new UniBrowserClient({ socketPath, requestTimeoutMs: 2_000 }).call("daemon.ping"), /before a response|EPIPE/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("client bounds an unterminated daemon response", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const socketPath = join(root, "uni.sock");
  const server = net.createServer((socket) => socket.on("data", () => socket.write("x".repeat(2_048))));
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    await assert.rejects(() => new UniBrowserClient({ socketPath, maxResponseBytes: 1_024 }).call("daemon.ping"), /response exceeded/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("client cancellation destroys its socket and rejects as cancelled", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-abort-")); const socketPath = join(root, "uni.sock");
  const server = net.createServer(() => {});
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(() => new UniBrowserClient({ socketPath }).call("daemon.ping", "default", {}, cancelled.signal), (error) => error.name === "AbortError" && error.code === "ABORT_ERR");
    const controller = new AbortController();
    const pending = new UniBrowserClient({ socketPath, requestTimeoutMs: 5_000 }).call("daemon.ping", "default", {}, controller.signal);
    controller.abort();
    await assert.rejects(() => pending, (error) => error.name === "AbortError");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("opening a profile passes its managed persistent directory to the daemon", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const calls = []; const store = new ProfileStore({ root }); const service = new DshUniBrowser({ store, client: { async call(action, session, params) { calls.push({ action, session, params }); return { session }; } } });
  const profile = await service.create({ name: "Personal" }); await service.open(profile.id);
  assert.deepEqual(calls[0], { action: "session.create", session: "dsh-personal", params: { engine: "chromium", headless: false, user_data_dir: join(root, "profiles", "personal"), audit: true } });
  assert.equal((await stat(join(root, "profiles"))).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, "profiles", "personal"))).mode & 0o777, 0o700);
});

test("concurrent profile creates remain durable with private registry permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-concurrent-")); const store = new ProfileStore({ root });
  await Promise.all(Array.from({ length: 12 }, (_, index) => store.create({ name: `Profile ${index}` })));
  assert.equal((await stat(join(root, "profiles.json"))).mode & 0o777, 0o600);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal((await new ProfileStore({ root }).list()).length, 12);
});

test("a damaged profile registry fails at first use instead of as an unhandled rejection", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-corrupt-"));
  await writeFile(join(root, "profiles.json"), "{\n  \"version\": 1,\n  \"profiles\": [\n");
  const rejections = []; const onRejection = (reason) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    const store = new ProfileStore({ root });
    await assert.rejects(() => store.list(), new RegExp(`${escapeRegExp(store.path)} could not be loaded`));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(rejections, []);
  } finally { process.off("unhandledRejection", onRejection); }
});

test("a registry path outside the plugin root is rejected before any chmod", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-root-"));
  const outside = await mkdtemp(join(tmpdir(), "dsh-uni-browser-outside-")); await chmod(outside, 0o755);
  assert.throws(() => new ProfileStore({ root, path: join(outside, "profiles.json") }), /must stay inside the plugin root/);
  assert.throws(() => new ProfileStore({ root, profilesRoot: outside }), /must stay inside the plugin root/);
  assert.equal((await stat(outside)).mode & 0o777, 0o755);
});

test("profiles reports an unexpected session.list failure at warn and stays quiet when unreachable", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-warn-")); const warnings = [];
  const logger = { warn(message) { warnings.push(String(message)); } };
  const broken = new DshUniBrowser({ store: new ProfileStore({ root }), client: { async call() { throw new Error("daemon exploded"); } }, logger });
  assert.deepEqual(await broken.profiles(), []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /daemon exploded/);
  const unreachable = new DshUniBrowser({ store: new ProfileStore({ root }), client: { async call() { throw daemonUnavailable("uni-browser daemon unavailable at /tmp/uni.sock", new Error("offline")); } }, logger });
  assert.deepEqual(await unreachable.profiles(), []);
  assert.equal(warnings.length, 1);
});

test("every registered tool compiles with DSH's strict output schema compiler", () => {
  const tools = [];
  apply(applyContext(tools));
  assert.equal(tools.length, 10);
});

test("apply owns the daemon it started and never signals one that was already running", async () => {
  const stopped = []; const effects = [];
  const runtime = { socketPath: "/tmp/injected-uni.sock", managed: false, async ensure() {}, async stop() { stopped.push(true); return true; } };
  apply(applyContext([], effects), { runtime });
  const owned = effects.find(({ label }) => /managed daemon/.test(label));
  assert.ok(owned, "apply registers the effect that owns the daemon it may have spawned");
  assert.equal(effects.findIndex(({ label }) => label === owned.label), 0, "the daemon effect precedes the settings route");
  await owned.dispose();
  assert.equal(stopped.length, 1);
});

test("a tool forwards its execution signal into the daemon call", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-signal-")); const store = new ProfileStore({ root });
  await store.create({ name: "Research" });
  const seen = []; const tools = [];
  apply(applyContext(tools), { store, client: { async call(action, session, params, signal) { seen.push({ action, session, params, signal }); return {}; } } });
  const tool = tools.find((item) => item.name === "uni_browser_snapshot");
  const controller = new AbortController();
  await tool.execute({ profile: "research" }, { signal: controller.signal });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].action, "page.snapshot");
  assert.equal(seen[0].session, "dsh-research");
  assert.equal(seen[0].signal, controller.signal);
});

test("Chinese profile names retain their label and use stable safe session keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-unicode-profile-"));
  const store = new ProfileStore({ root });
  const profile = await store.create({ name: "资料研究" });
  assert.equal(profile.name, "资料研究");
  assert.match(profile.id, /^profile-[a-f0-9]{16}$/);
  assert.equal((await store.get("资料研究")).id, profile.id);
  assert.equal((await store.get(profile.id)).name, "资料研究");
  await assert.rejects(store.create({ name: "资料研究" }), /already exists/);
  await assert.rejects(store.create({ name: "../..." }), /letters or numbers/);
});

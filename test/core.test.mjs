import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { apply, DshUniBrowser, ProfileStore, UniBrowserClient } from "../lib/index.js";

test("profile registry keeps a named persistent Camoufox profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const store = new ProfileStore({ root });
  const profile = await store.create({ name: "Research Camoufox" });
  assert.deepEqual(profile, { id: "research-camoufox", name: "Research Camoufox", engine: "camoufox", headless: false, session: "dsh-research-camoufox", createdAt: profile.createdAt });
  assert.equal(store.profileDir(profile), join(root, "profiles", "research-camoufox"));
  assert.equal((await store.list()).length, 1);
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

test("opening a profile passes its managed persistent directory to the daemon", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const calls = []; const store = new ProfileStore({ root }); const service = new DshUniBrowser({ store, client: { async call(action, session, params) { calls.push({ action, session, params }); return { session }; } } });
  const profile = await service.create({ name: "Personal" }); await service.open(profile.id);
  assert.deepEqual(calls[0], { action: "session.create", session: "dsh-personal", params: { engine: "camoufox", headless: false, user_data_dir: join(root, "profiles", "personal"), audit: true } });
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

test("every registered tool compiles with DSH's strict output schema compiler", () => {
  const tools = [];
  apply({
    provide() {},
    connection: { rpc: { handle() {} } },
    tools: { register(tool) { tools.push(tool); } }
  });
  assert.equal(tools.length, 10);
});

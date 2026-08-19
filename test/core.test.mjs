import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DshUniBrowser, ProfileStore, UniBrowserClient } from "../lib/index.js";

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

test("opening a profile passes its managed persistent directory to the daemon", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsh-uni-browser-")); const calls = []; const store = new ProfileStore({ root }); const service = new DshUniBrowser({ store, client: { async call(action, session, params) { calls.push({ action, session, params }); return { session }; } } });
  const profile = await service.create({ name: "Personal" }); await service.open(profile.id);
  assert.deepEqual(calls[0], { action: "session.create", session: "dsh-personal", params: { engine: "camoufox", headless: false, user_data_dir: join(root, "profiles", "personal"), audit: true } });
});

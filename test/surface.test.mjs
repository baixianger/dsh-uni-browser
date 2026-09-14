import assert from "node:assert/strict";
import test from "node:test";
import { apply, createBrowserHandler, handleBrowserRequest, registerBrowserChannel, SETTINGS_PATH } from "../lib/index.js";

/** The browser service the card drives, with every call recorded. */
function browserStub(overrides = {}) {
  const calls = [];
  const browser = {
    calls,
    async health(signal) { calls.push({ endpoint: "health", signal }); return { online: true }; },
    async profiles(signal) { calls.push({ endpoint: "profiles", signal }); return []; },
    async create(args) { calls.push({ endpoint: "create", args }); return { id: "research" }; },
    async open(id, signal) { calls.push({ endpoint: "open", id, signal }); return { id }; },
    async close(id, signal) { calls.push({ endpoint: "close", id, signal }); return { id }; },
    async forget(id, confirm, signal) { calls.push({ endpoint: "forget", id, confirm, signal }); return { id }; },
    ...overrides
  };
  return browser;
}

/** The context shape `apply` sees, with only the seams this plugin declares. */
function pluginContext(routes) {
  return {
    logger: () => ({ warn() {} }),
    provide() {},
    effect(execute) { return execute(); },
    inject(_services, callback) { callback(this); },
    connection: { fetch: { register(route) { routes.push(route); return () => {}; } } },
    tools: { register() {} }
  };
}

test("the settings route is published on /api as a buffered POST Fetch route", () => {
  const routes = [];
  const effects = [];
  const ctx = pluginContext(routes);
  const ownEffect = ctx.effect;
  ctx.effect = (execute, label) => { const disposer = ownEffect(execute); effects.push(label); return disposer; };
  apply(ctx);

  // The card's transport is a Fetch route under `/api` — the single path this
  // deployment mounts and fences — not a per-plugin RPC channel.
  assert.deepEqual(routes.map((route) => [route.path, route.methods, route.requestBody]), [
    ["/api/dsh-uni-browser", ["POST"], "buffered"]
  ]);
  assert.equal(routes[0].path, SETTINGS_PATH);
  // The registration belongs to the connection fiber, not to apply's own.
  assert.ok(effects.includes("dsh-uni-browser: settings route"));
});

test("the route registration declares connection instead of reading it as a property", () => {
  const injected = [];
  const routes = [];
  registerBrowserChannel({
    inject(services, callback) { injected.push([...services]); callback({ effect: (registration) => registration(), connection: { fetch: { register(route) { routes.push(route); return () => {}; } } } }); }
  }, browserStub());
  assert.deepEqual(injected, [["connection"]]);
  assert.equal(routes.length, 1);
});

test("the settings route answers an RpcResult for every input", async () => {
  const seen = [];
  const handler = async (endpoint, payload, signal) => {
    seen.push({ endpoint, args: payload?.args, signal });
    return { ok: true, value: { endpoint } };
  };
  const controller = new AbortController();
  const request = { signal: controller.signal, json: async () => ({ endpoint: "health", args: { a: 1 } }) };
  const response = await handleBrowserRequest(handler, request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true, value: { endpoint: "health" } });
  assert.deepEqual(seen, [{ endpoint: "health", args: { a: 1 }, signal: controller.signal }]);

  // A body that is not JSON and one without an endpoint are answered as
  // envelopes: a throw here would surface in the browser as an opaque transport
  // failure instead of a message a human can act on.
  const notJson = await handleBrowserRequest(handler, { signal: controller.signal, json: async () => { throw new Error("bad json"); } });
  assert.equal(notJson.status, 200);
  const notJsonEnvelope = await notJson.json();
  assert.equal(notJsonEnvelope.ok, false);
  assert.deepEqual(notJsonEnvelope.error.details, {});

  const noEndpoint = await handleBrowserRequest(handler, { signal: controller.signal, json: async () => ({ args: {} }) });
  assert.equal(noEndpoint.status, 200);
  const noEndpointEnvelope = await noEndpoint.json();
  assert.equal(noEndpointEnvelope.ok, false);
  assert.match(noEndpointEnvelope.error.message, /endpoint/);

  const emptyEndpoint = await handleBrowserRequest(handler, { signal: controller.signal, json: async () => ({ endpoint: "" }) });
  assert.equal(emptyEndpoint.status, 200);
  assert.equal((await emptyEndpoint.json()).ok, false);

  // A thrown handler — including one that fails because the request was
  // cancelled — is an envelope, never a 500.
  const thrown = await handleBrowserRequest(async () => { throw new Error("daemon exploded"); }, { signal: controller.signal, json: async () => ({ endpoint: "profiles" }) });
  assert.equal(thrown.status, 200);
  const thrownEnvelope = await thrown.json();
  assert.equal(thrownEnvelope.ok, false);
  assert.match(thrownEnvelope.error.message, /daemon exploded/);
});

test("the channel handler forwards the request signal to every endpoint", async () => {
  const browser = browserStub();
  const handler = createBrowserHandler(browser);
  const controller = new AbortController();

  for (const [endpoint, args] of [["health", {}], ["profiles", {}], ["open", { id: "research" }], ["close", { id: "research" }], ["forget", { id: "research", confirm: true }]]) {
    const envelope = await handler(endpoint, { endpoint, args }, controller.signal);
    assert.equal(envelope.ok, true);
    assert.equal(browser.calls.at(-1).signal, controller.signal, `${endpoint} keeps its cancellation signal`);
  }
  const create = await handler("create", { endpoint: "create", args: { name: "Research" } }, controller.signal);
  assert.equal(create.ok, true);
  assert.deepEqual(browser.calls.at(-1), { endpoint: "create", args: { name: "Research" } });

  await assert.rejects(() => handler("missing", { endpoint: "missing", args: {} }, controller.signal), /unknown dsh-uni-browser endpoint: missing/);
});

test("the route answers a cancelled request as an envelope rather than a transport failure", async () => {
  const browser = browserStub({ async profiles() { throw Object.assign(new Error("profiles aborted before a response"), { name: "AbortError", code: "ABORT_ERR" }); } });
  const routes = [];
  apply(pluginContext(routes));
  const handler = createBrowserHandler(browser);
  const response = await handleBrowserRequest(handler, { signal: new AbortController().signal, json: async () => ({ endpoint: "profiles", args: {} }) });
  assert.equal(response.status, 200);
  const envelope = await response.json();
  assert.equal(envelope.ok, false);
  assert.match(envelope.error.message, /aborted/);
});

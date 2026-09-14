import assert from "node:assert/strict";
import test from "node:test";

/** A stand-in React that records the effects a render pass runs. */
function createReact() {
  const cleanups = [];
  return {
    cleanups,
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => [initial, () => {}],
    useCallback: (callback) => callback,
    useEffect: (effect) => { const cleanup = effect(); if (typeof cleanup === "function") cleanups.push(cleanup); }
  };
}

/**
 * Load the browser bundle under a React stand-in, the way the module loader
 * hands the real one to the factory.
 * @returns the loaded plugin and the stand-in React.
 */
async function loadPlugin() {
  let plugin;
  const React = createReact();
  globalThis.window = { __ModuleLoader__: { load(entry) { plugin = entry.factory((id) => { assert.equal(id, "react"); return React; }); } } };
  try { await import(`../lib/client.js?test=${Date.now()}`); } finally { delete globalThis.window; }
  return { plugin, React };
}

test("client contributes a Uni Browser settings section", async () => {
  const { plugin } = await loadPlugin();
  const registrations = []; plugin.apply({ locale: { bind: () => (key) => key === "title" ? "Uni Browser" : key, register: () => () => {} }, effect: (cb) => cb(),  slots: { inject(_name, mount) { mount(); }, register(options) { registrations.push(options); } } });
  assert.deepEqual(registrations.map((item) => item.id), ["uni-browser"]);
});

test("the card posts its endpoints to the /api route and keeps its cancellation signal", async () => {
  const { plugin, React } = await loadPlugin();
  const requests = [];
  const previousFetch = globalThis.fetch;
  // The card posts to the host's `/api` Fetch route; the test stands in for the
  // browser's fetch and for Connection's fence.
  globalThis.fetch = (path, init) => {
    requests.push({ path, init });
    return new Promise(() => {});
  };
  try {
    const registrations = [];
    plugin.apply({ locale: { bind: () => (key) => key === "title" ? "Uni Browser" : key, register: () => () => {} }, effect: (cb) => cb(),  slots: { inject(_name, mount) { mount(); }, register(options, component) { registrations.push({ options, component }); } } });
    const BrowserSettings = registrations.find(({ options }) => options.id === "uni-browser").component;
    BrowserSettings();

    assert.equal(requests.length, 2, "the card asks for both profiles and health");
    const signal = requests[0].init.signal;
    assert.ok(signal instanceof AbortSignal, "the request carries the card's abort signal");
    assert.equal(requests[1].init.signal, signal);
    for (const { path, init } of requests) {
      assert.equal(path, "/api/dsh-uni-browser");
      assert.equal(init.method, "POST");
      assert.equal(init.headers["content-type"], "application/json");
      assert.equal(init.credentials, "same-origin");
      assert.ok(["profiles", "health"].includes(JSON.parse(init.body).endpoint));
    }

    for (const cleanup of React.cleanups) cleanup();
    assert.equal(signal.aborted, true, "unmounting the card aborts the in-flight request");
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
  }
});

import assert from "node:assert/strict";
import test from "node:test";

test("client contributes a Uni Browser settings section", async () => {
  let plugin; globalThis.window = { __ModuleLoader__: { load(entry) { plugin = entry.factory((id) => { assert.equal(id, "react"); return { createElement() {}, useState() {}, useCallback() {}, useEffect() {} }; }); } } };
  try { await import(`../lib/client.js?test=${Date.now()}`); } finally { delete globalThis.window; }
  const registrations = []; plugin.apply({ connection: { rpc: { async call() { return { ok: true, value: {} }; } } }, slots: { inject(_name, mount) { mount(); }, register(options) { registrations.push(options); } } });
  assert.deepEqual(registrations.map((item) => item.id), ["uni-browser"]);
});

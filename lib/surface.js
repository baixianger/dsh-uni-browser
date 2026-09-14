/**
 * Host-side surface for the Uni Browser settings card.
 *
 * The card's transport is a Connection **Fetch route under `/api`**, which is
 * the mechanism the shipped plugins use (`/api/file`,
 * `/api/session/uploadFileBinary`, …) and the one this deployment actually
 * serves: Connection mounts a single `/api` prefix route carrying the browser
 * fence, and dispatches its exact Fetch routes from there. A per-plugin
 * `connection.rpc.handle("/dsh-uni-browser")` registration produces no
 * reachable route at all here, so every call from the card falls through to
 * the web carrier's static fallback, which answers a non-GET request with 405.
 * @module dsh-uni-browser/surface
 */

/** HTTP path the settings card posts to; under `/api` so Connection fences it. */
export const SETTINGS_PATH = "/api/dsh-uni-browser";

function ok(value) {
  return { ok: true, value };
}

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

/** JSON response carrying one RpcResult envelope. */
function envelopeResponse(envelope) {
  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

/**
 * Answer one settings-card POST.
 *
 * Connection's `/api` route has already applied the browser fence, so this only
 * has to decode the envelope, dispatch the endpoint, and always answer 200 with
 * an RpcResult — a thrown handler would surface as an opaque transport failure
 * in the browser, and a cancelled request is still a failure the card can read.
 * @param handler - the browser channel handler.
 * @param request - the incoming request.
 * @returns the response carrying the RpcResult.
 */
export async function handleBrowserRequest(handler, request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return envelopeResponse(failure("bad-request", "request body is not JSON"));
  }
  const endpoint = payload?.endpoint;
  if (typeof endpoint !== "string" || endpoint === "") {
    return envelopeResponse(failure("bad-request", "endpoint must be a non-empty string"));
  }
  try {
    return envelopeResponse(await handler(endpoint, payload, request.signal));
  } catch (error) {
    // Cancellation reaches here as an abort error; it is answered like any
    // other failure so the card reports it instead of an HTTP 500.
    return envelopeResponse(failure("internal", error?.message ?? String(error)));
  }
}

/**
 * Build the `/api/dsh-uni-browser` channel handler.
 *
 * Every input is answered with an RpcResult: a thrown handler becomes a bare
 * HTTP 500 that the browser can only report as a transport failure. The
 * request's cancellation signal is forwarded so an abandoned card request also
 * abandons the daemon call.
 * @param browser - the browser service the card drives.
 * @returns the channel handler.
 */
export function createBrowserHandler(browser) {
  return async (endpoint, payload, signal) => {
    const args = payload?.args ?? {};
    if (endpoint === "health") return ok(await browser.health(signal));
    if (endpoint === "profiles") return ok({ profiles: await browser.profiles(signal) });
    if (endpoint === "create") return ok(await browser.create(args));
    if (endpoint === "open") return ok(await browser.open(args.id, signal));
    if (endpoint === "close") return ok(await browser.close(args.id, signal));
    if (endpoint === "forget") return ok(await browser.forget(args.id, args.confirm, signal));
    throw new Error(`unknown dsh-uni-browser endpoint: ${endpoint}`);
  };
}

/**
 * Publish the settings route on `/api`.
 *
 * `connection` is a hard dependency of this callback, not an ambient property:
 * reading `ctx.connection` without declaring it yields no service, so the route
 * would never be registered.
 * @param ctx - the plugin context.
 * @param browser - the browser service the card drives.
 */
export function registerBrowserChannel(ctx, browser) {
  const handler = createBrowserHandler(browser);
  ctx.inject(["connection"], (connectionCtx) => {
    connectionCtx.effect(() => connectionCtx.connection.fetch.register({
      path: SETTINGS_PATH,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handleBrowserRequest(handler, request)
    }), "dsh-uni-browser: settings route");
  });
}

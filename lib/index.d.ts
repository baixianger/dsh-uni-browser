import type { Context } from "@deepseek-ai/cordis";

export declare const name = "dsh-uni-browser";
export declare const inject: readonly ["connection", "tools"];
export interface DshUniBrowserConfig {
  socketPath?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  binaryPath?: string;
  workspace?: string;
  startupTimeoutMs?: number;
  autoStart?: boolean;
  defaultEngine?: "camoufox" | "chromium";
  root?: string;
  path?: string;
  profilesRoot?: string;
}
export declare const Config: import("@standard-schema/spec").StandardSchemaV1<unknown, DshUniBrowserConfig>;
export interface BrowserProfile { id: string; name: string; engine: "camoufox" | "chromium"; headless: boolean; session: string; createdAt: number; }
export declare const UNI_BROWSER_RUNTIME_VERSION = "0.1.2";
export declare const PLATFORM_PACKAGES: Readonly<Record<string, string>>;
export declare const DAEMON_UNAVAILABLE = "UNI_BROWSER_DAEMON_UNAVAILABLE";
export declare function daemonUnavailable(message: string, cause?: Error): Error;
export declare function defaultRoot(env?: NodeJS.ProcessEnv): string;
export declare function platformPackageName(platform?: NodeJS.Platform, arch?: string): string;
export declare class UniBrowserRuntime {
  readonly root: string; readonly workspace: string; readonly socketPath: string; readonly managed: boolean; readonly startupTimeoutMs: number;
  runtimeSource: string;
  started: boolean;
  constructor(config?: DshUniBrowserConfig);
  resolveBinary(): Promise<string>;
  ensure(client: UniBrowserClient): Promise<{ binaryPath?: string; socketPath: string; source: string; started: boolean }>;
  stop(): Promise<boolean>;
}
export declare class UniBrowserClient {
  readonly socketPath: string;
  readonly requestTimeoutMs: number;
  readonly maxResponseBytes: number;
  constructor(config?: DshUniBrowserConfig);
  call(action: string, session?: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>;
}
export declare class ProfileStore {
  readonly root: string; readonly path: string; readonly profilesRoot: string;
  constructor(config?: DshUniBrowserConfig);
  whenReady(): Promise<void>;
  list(): Promise<BrowserProfile[]>;
  create(input: { name: string; engine?: "camoufox" | "chromium"; headless?: boolean }): Promise<BrowserProfile>;
  get(id: string): Promise<BrowserProfile>;
  profileDir(profile: BrowserProfile): string;
  forget(id: string): Promise<BrowserProfile>;
}
export declare class DshUniBrowser {
  constructor(config?: DshUniBrowserConfig & { client?: UniBrowserClient; store?: ProfileStore; runtime?: UniBrowserRuntime });
  call(action: string, session?: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>;
  stop(): Promise<boolean>;
  health(signal?: AbortSignal): Promise<{ online: boolean; socketPath: string; managed: boolean; runtimeSource: string }>;
  profiles(signal?: AbortSignal): Promise<Array<BrowserProfile & { active: boolean; daemonOnline: boolean }>>;
  create(input: { name: string; engine?: "camoufox" | "chromium"; headless?: boolean }): Promise<BrowserProfile>;
  open(id: string, signal?: AbortSignal): Promise<unknown>; close(id: string, signal?: AbortSignal): Promise<unknown>;
  forget(id: string, confirm: boolean, signal?: AbortSignal): Promise<BrowserProfile>;
  action(id: string, action: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>;
}
declare module "@deepseek-ai/cordis" { interface Context { dshUniBrowser: DshUniBrowser; } }
/** One RpcResult envelope the settings card reads. */
export type BrowserEnvelope = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } };
/** The browser channel handler behind the `/api/dsh-uni-browser` route. */
export declare function createBrowserHandler(browser: DshUniBrowser): (endpoint: string, payload: { args?: Record<string, unknown> }, signal?: AbortSignal) => Promise<BrowserEnvelope>;
/** Answer one settings-card POST with an envelope, never a 500. */
export declare function handleBrowserRequest(handler: (endpoint: string, payload: { args?: Record<string, unknown> }, signal?: AbortSignal) => Promise<BrowserEnvelope>, request: { signal?: AbortSignal; json(): Promise<unknown> }): Promise<Response>;
/** Publish the settings route on `/api`. */
export declare function registerBrowserChannel(ctx: Context, browser: DshUniBrowser): void;
/** HTTP path the settings card posts to; under `/api` so Connection fences it. */
export declare const SETTINGS_PATH = "/api/dsh-uni-browser";
export declare function apply(ctx: Context, config?: DshUniBrowserConfig): void;

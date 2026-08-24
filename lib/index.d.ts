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
export declare function platformPackageName(platform?: NodeJS.Platform, arch?: string): string;
export declare class UniBrowserRuntime {
  readonly root: string; readonly workspace: string; readonly socketPath: string; readonly managed: boolean; readonly startupTimeoutMs: number;
  runtimeSource: string;
  constructor(config?: DshUniBrowserConfig);
  resolveBinary(): Promise<string>;
  ensure(client: UniBrowserClient): Promise<{ binaryPath?: string; socketPath: string; source: string; started: boolean }>;
}
export declare class UniBrowserClient {
  readonly socketPath: string;
  readonly requestTimeoutMs: number;
  readonly maxResponseBytes: number;
  constructor(config?: DshUniBrowserConfig);
  call(action: string, session?: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export declare class ProfileStore {
  readonly root: string; readonly path: string; readonly profilesRoot: string;
  constructor(config?: DshUniBrowserConfig);
  list(): Promise<BrowserProfile[]>;
  create(input: { name: string; engine?: "camoufox" | "chromium"; headless?: boolean }): Promise<BrowserProfile>;
  get(id: string): Promise<BrowserProfile>;
  profileDir(profile: BrowserProfile): string;
  forget(id: string): Promise<BrowserProfile>;
}
export declare class DshUniBrowser {
  constructor(config?: DshUniBrowserConfig & { client?: UniBrowserClient; store?: ProfileStore; runtime?: UniBrowserRuntime });
  call(action: string, session?: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  health(): Promise<{ online: boolean; socketPath: string; managed: boolean; runtimeSource: string }>;
  profiles(): Promise<Array<BrowserProfile & { active: boolean; daemonOnline: boolean }>>;
  create(input: { name: string; engine?: "camoufox" | "chromium"; headless?: boolean }): Promise<BrowserProfile>;
  open(id: string): Promise<unknown>; close(id: string): Promise<unknown>; forget(id: string, confirm: boolean): Promise<BrowserProfile>;
  action(id: string, action: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}
declare module "@deepseek-ai/cordis" { interface Context { dshUniBrowser: DshUniBrowser; } }
export declare function apply(ctx: Context, config?: DshUniBrowserConfig): void;

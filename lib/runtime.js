import { constants } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);

export const UNI_BROWSER_RUNTIME_VERSION = "0.1.2";
export const PLATFORM_PACKAGES = Object.freeze({
  "darwin-arm64": "dsh-uni-browser-darwin-arm64",
  "darwin-x64": "dsh-uni-browser-darwin-x64",
  "linux-arm64": "dsh-uni-browser-linux-arm64",
  "linux-x64": "dsh-uni-browser-linux-x64"
});

/** Error code marking the documented "no daemon answered" case. */
export const DAEMON_UNAVAILABLE = "UNI_BROWSER_DAEMON_UNAVAILABLE";

/** Build the marked error for a daemon this process cannot reach. */
export function daemonUnavailable(message, cause) {
  const error = new Error(cause === undefined ? message : `${message}: ${cause.message}`);
  error.code = DAEMON_UNAVAILABLE;
  return error;
}

/** Default plugin root: an explicit config root, else `$DSH_HOME/dsh-uni-browser`, else `~/.dsh/dsh-uni-browser`. */
export function defaultRoot(env = process.env) {
  return join(env.DSH_HOME ? env.DSH_HOME : join(homedir(), ".dsh"), "dsh-uni-browser");
}

/** True when target is root itself or lies underneath it. */
export function insideRoot(target, root) {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

/**
 * Ambient names the daemon may inherit. Every name absent here — credentials
 * such as `OPENAI_API_KEY` and every `DSH_*` harness fact — is dropped, so a
 * third-party binary and the browser it launches never see the harness
 * environment.
 */
const DAEMON_ENV_ALLOWLIST = Object.freeze([
  // Process plumbing and locale.
  "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "USER", "SHELL",
  // Display and session facts a browser needs to open a window.
  "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "DBUS_SESSION_BUS_ADDRESS",
  // Plugin-owned browser selection: executable paths, never credentials.
  "UNI_BROWSER_CHROMIUM_BIN", "UNI_BROWSER_CAMOUFOX_BIN"
]);

/** Copy only allowlisted ambient values, then this plugin's own overrides. */
function childEnvironment(overrides) {
  const env = {};
  for (const name of DAEMON_ENV_ALLOWLIST) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, ...overrides };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function unusableReason(path) {
  try {
    await access(path, constants.X_OK);
    return undefined;
  } catch (error) {
    return error?.code === "ENOENT" ? "does not exist" : `is not executable (${error?.code ?? "access failed"})`;
  }
}

async function executable(path) {
  return (await unusableReason(path)) === undefined;
}

export function platformPackageName(platform = process.platform, arch = process.arch) {
  const packageName = PLATFORM_PACKAGES[`${platform}-${arch}`];
  if (!packageName) throw new Error(`dsh-uni-browser does not provide a uni-browser runtime for ${platform}-${arch}`);
  return packageName;
}

async function findOnPath(command, pathValue = process.env.PATH ?? "") {
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    if (await executable(candidate)) return candidate;
  }
}

async function findChromiumBinary(platform = process.platform) {
  const candidates = platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
}

export class UniBrowserRuntime {
  constructor(config = {}) {
    this.root = config.root ?? defaultRoot();
    this.workspace = config.workspace ?? join(this.root, "daemon");
    const externalSocket = config.socketPath ?? process.env.UNI_BROWSER_SOCKET;
    this.socketPath = externalSocket ?? join(this.workspace, "uni.sock");
    this.managed = config.autoStart !== false && externalSocket == null;
    this.binaryPath = config.binaryPath ?? process.env.UNI_BROWSER_BIN;
    this.startupTimeoutMs = config.startupTimeoutMs ?? 20_000;
    this.spawnProcess = config.spawnProcess ?? spawn;
    this.wait = config.wait ?? sleep;
    this.resolvePackage = config.resolvePackage ?? ((packageName) => require.resolve(packageName));
    this.stopGraceMs = config.stopGraceMs ?? 2_000;
    this.started = false;
    this.child = undefined;
    this.ensurePromise = undefined;
    this.runtimeSource = this.managed ? "unresolved" : "external-socket";
  }

  async resolveBinary() {
    if (this.binaryPath) {
      if (!(await executable(this.binaryPath))) throw new Error(`UNI_BROWSER_BIN is not executable: ${this.binaryPath}`);
      this.runtimeSource = "explicit-binary";
      return this.binaryPath;
    }

    const packageName = platformPackageName();
    let packaged;
    try {
      packaged = this.resolvePackage(packageName);
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }

    if (packaged !== undefined) {
      const problem = await unusableReason(packaged);
      if (problem) throw new Error(`installed ${packageName} runtime is unusable: ${packaged} ${problem}; reinstall the platform package or set UNI_BROWSER_BIN`);
      this.runtimeSource = packageName;
      return packaged;
    }

    const system = await findOnPath("uni-browser");
    if (system) {
      this.runtimeSource = "system-path";
      return system;
    }

    throw new Error(
      `uni-browser runtime is missing for ${process.platform}-${process.arch}; reinstall dsh-uni-browser with optional dependencies enabled, or set UNI_BROWSER_BIN`
    );
  }

  async ensure(client) {
    try {
      await client.call("daemon.ping");
      return { socketPath: this.socketPath, source: this.runtimeSource, started: false };
    } catch (error) {
      if (!this.managed) throw daemonUnavailable(`externally managed uni-browser daemon is unavailable at ${this.socketPath}`, error);
    }

    if (!this.ensurePromise) {
      this.ensurePromise = this.#start(client).finally(() => {
        this.ensurePromise = undefined;
      });
    }
    return this.ensurePromise;
  }

  /**
   * Stop the daemon this instance spawned, escalating SIGTERM to SIGKILL after
   * a short grace. A daemon that was already running when this instance looked
   * (an external socket, or another owner's process) is never signalled.
   * @returns true when this instance owned and terminated a daemon.
   */
  async stop() {
    const child = this.child;
    if (!this.started || child === undefined) return false;
    this.child = undefined;
    this.started = false;
    if (child.exitCode != null || child.signalCode != null) return true;
    const terminated = this.#waitForExit(child);
    child.kill?.("SIGTERM");
    if (await terminated) return true;
    const killed = this.#waitForExit(child);
    child.kill?.("SIGKILL");
    await killed;
    return true;
  }

  #waitForExit(child) {
    return new Promise((resolve) => {
      let timer;
      const finish = (exited) => {
        clearTimeout(timer);
        child.removeListener?.("exit", onExit);
        child.removeListener?.("close", onExit);
        resolve(exited);
      };
      const onExit = () => finish(true);
      timer = setTimeout(() => finish(false), this.stopGraceMs);
      child.once?.("exit", onExit);
      child.once?.("close", onExit);
    });
  }

  async #start(client) {
    if (this.child !== undefined && this.child.exitCode == null) {
      throw new Error(`uni-browser daemon is already running (pid ${this.child.pid ?? "unknown"}); refusing to start a second one`);
    }

    const binary = await this.resolveBinary();
    await mkdir(this.workspace, { recursive: true, mode: 0o700 });
    // Only a workspace under the plugin root is narrowed: an explicitly
    // configured external directory keeps its own mode.
    if (insideRoot(this.workspace, this.root)) await chmod(this.workspace, 0o700);

    const env = childEnvironment({ UNI_BROWSER_WORKSPACE: this.workspace, UNI_BROWSER_SOCKET: this.socketPath });
    if (!env.UNI_BROWSER_CHROMIUM_BIN) {
      const chromium = await findChromiumBinary();
      if (chromium) env.UNI_BROWSER_CHROMIUM_BIN = chromium;
    }

    let spawnError;
    const child = this.spawnProcess(binary, ["daemon", "serve", "--workspace", this.workspace, "--socket", this.socketPath], {
      detached: true,
      env,
      stdio: "ignore"
    });
    this.child = child;
    this.started = true;
    child.once?.("error", (error) => { spawnError = error; });
    child.unref?.();

    const deadline = Date.now() + this.startupTimeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`failed to start uni-browser daemon: ${spawnError.message}`);
      try {
        await client.call("daemon.ping");
        return { binaryPath: binary, socketPath: this.socketPath, source: this.runtimeSource, started: true };
      } catch (error) {
        lastError = error;
      }
      if (child.exitCode != null) throw new Error(`uni-browser daemon exited during startup with code ${child.exitCode}`);
      await this.wait(100);
    }
    throw new Error(`uni-browser daemon did not become ready at ${this.socketPath}: ${lastError?.message ?? "startup timed out"}`);
  }
}

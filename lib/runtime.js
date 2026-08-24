import { constants } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
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
    this.root = config.root ?? join(homedir(), ".dsh", "dsh-uni-browser");
    this.workspace = config.workspace ?? join(this.root, "daemon");
    const externalSocket = config.socketPath ?? process.env.UNI_BROWSER_SOCKET;
    this.socketPath = externalSocket ?? join(this.workspace, "uni.sock");
    this.managed = config.autoStart !== false && externalSocket == null;
    this.binaryPath = config.binaryPath ?? process.env.UNI_BROWSER_BIN;
    this.startupTimeoutMs = config.startupTimeoutMs ?? 20_000;
    this.spawnProcess = config.spawnProcess ?? spawn;
    this.wait = config.wait ?? sleep;
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
    try {
      const packaged = require.resolve(packageName);
      if (await executable(packaged)) {
        this.runtimeSource = packageName;
        return packaged;
      }
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
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
      if (!this.managed) throw new Error(`externally managed uni-browser daemon is unavailable at ${this.socketPath}: ${error.message}`);
    }

    if (!this.ensurePromise) {
      this.ensurePromise = this.#start(client).finally(() => {
        this.ensurePromise = undefined;
      });
    }
    return this.ensurePromise;
  }

  async #start(client) {
    const binary = await this.resolveBinary();
    await mkdir(this.workspace, { recursive: true, mode: 0o700 });
    await chmod(this.workspace, 0o700);

    const env = { ...process.env, UNI_BROWSER_WORKSPACE: this.workspace, UNI_BROWSER_SOCKET: this.socketPath };
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

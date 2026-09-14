<div align="center">

<img src="docs/assets/hero.svg" alt="DSH Uni Browser" width="100%" />

# DSH Uni Browser

[English](README.md) · [简体中文](README.zh.md)

[![npm](https://img.shields.io/npm/v/dsh-uni-browser?style=flat-square&color=374151)](https://www.npmjs.com/package/dsh-uni-browser) [![License: MIT](https://img.shields.io/badge/License-MIT-374151?style=flat-square)](LICENSE) [![DSH plugin](https://img.shields.io/badge/DSH-plugin-374151?style=flat-square)](https://github.com/topics/dsh-plugin)

</div>

Give DSH agents named browser profiles that retain their local sign-in state. Open a visible browser to log in yourself, then reuse that profile for later agent work.

## Keep your browser context

| Capability | Behavior |
| --- | --- |
| **Named profiles** | Separate Chromium or Camoufox profiles, including Unicode names. |
| **Persistent sign-in** | Reuse local cookies, localStorage, and IndexedDB. |
| **Agent actions** | Navigate, snapshot, click, type, and press through uni-browser's action API. |
| **Managed runtime** | Start a private local daemon on demand. |
| **Clear controls** | Open and Stop keep state; Forget removes it after confirmation. |

## Quick start

```bash
dsh plugin --profile web add dsh-uni-browser@latest
dsh web
```

1. Open **Settings → Uni Browser** and create a profile.
2. Keep **headless disabled** for a profile you need to sign into.
3. Choose **Open**, then complete sign-in yourself in the visible browser.
4. Ask the agent to use that profile for its browser task.

The settings page supports English/Chinese and DSH's theme. It distinguishes loading, empty lists, running profiles, and failed operations. Chinese and other Unicode names keep their display label while receiving a stable internal identifier.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `uni_browser_profiles` | List profiles and runtime state. |
| `uni_browser_profile_create` | Create a named profile. |
| `uni_browser_open` / `uni_browser_close` | Start or stop without deleting local state. |
| `uni_browser_forget` | Delete a profile after explicit confirmation. |
| `uni_browser_navigate` / `uni_browser_snapshot` | Navigate and read an accessibility snapshot. |
| `uni_browser_click` / `uni_browser_type` / `uni_browser_press` | Interact with the selected profile. |

## Runtime & browser engines

npm installs a matching **uni-browser daemon** for macOS ARM64/x64 or Linux ARM64/x64. The daemon starts under `$DSH_HOME/dsh-uni-browser/daemon` and communicates over a private Unix socket.

The plugin reuses installed Chrome/Chromium by default. For Camoufox, provide its executable with `UNI_BROWSER_CAMOUFOX_BIN`. The runtime package does not install a browser engine.

| Variable | Purpose |
| --- | --- |
| `UNI_BROWSER_SOCKET` | Use an externally managed daemon. |
| `UNI_BROWSER_BIN` | Use an explicit daemon executable. |
| `UNI_BROWSER_CHROMIUM_BIN` | Select the Chromium/Chrome executable. |
| `UNI_BROWSER_CAMOUFOX_BIN` | Select the Camoufox executable. |

If optional npm dependencies were omitted, supply a daemon socket or executable. Windows is outside the bundled runtime matrix.

## State & lifecycle

**Stop** retains the profile directory. **Forget** permanently removes cookies, local storage, IndexedDB, and other local sign-in state after confirmation.

Unloading stops a daemon started by this plugin; an externally managed daemon is left alone. Actions use uni-browser's audited NDJSON API rather than raw browser-debugging passthrough. Passwords and cookies are not passed as profile configuration or tool parameters.

## For maintainers

[Release and runtime guide](docs/releasing.md) explains pinned platform packages, checksum verification, and publication order. Plugin and runtime versions evolve independently; a new upstream runtime never changes an already-published plugin.

## Development & feedback

```bash
npm ci
npm run check
```

[Report an issue](https://github.com/baixianger/dsh-uni-browser/issues) · [Release notes](RELEASES.md) · [MIT license](LICENSE)

# dsh-uni-browser

[English](README.md) | [简体中文](README.zh.md)

> Persistent, named browser profiles for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness), powered by a local [uni-browser](https://github.com/baixianger/uni-browser) daemon.

## What it does

- Registers named Camoufox or Chromium profiles in DSH Settings → Uni Browser.
- Opens and stops profiles without losing their local cookies, localStorage, or IndexedDB.
- Lets DSH agents navigate, snapshot, click, type, and press through uni-browser's audited action API.
- Keeps browser passwords, cookies, and daemon tokens out of the DSH UI and tool parameters.

## Quick start

```bash
dsh plugin --profile web add dsh-uni-browser@next
dsh web
```

Open **Settings → Uni Browser**, create a profile, and choose **Open**. For a
login profile, keep headless mode disabled and sign in yourself in the visible
browser. The profile can then be selected explicitly by agent tools.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `uni_browser_profiles` | List persistent profiles and their runtime state |
| `uni_browser_profile_create` | Register a Chromium or Camoufox profile |
| `uni_browser_open` / `uni_browser_close` | Start or stop a profile without deleting its state |
| `uni_browser_forget` | Permanently delete a profile after explicit confirmation |
| `uni_browser_navigate` / `uni_browser_snapshot` | Navigate and read the accessibility snapshot |
| `uni_browser_click` / `uni_browser_type` / `uni_browser_press` | Interact through the audited action API |

## Runtime

The npm installation includes the matching macOS or Linux `uni-browser`
runtime as a platform-specific optional dependency. On first use, the plugin
starts a private daemon under `~/.dsh/dsh-uni-browser/daemon` and then talks to
it directly over its Unix socket.

Set `UNI_BROWSER_SOCKET` to use an externally managed daemon, or
`UNI_BROWSER_BIN` to use an explicit binary. Installations that deliberately
omit optional npm dependencies must provide one of those overrides.

New profiles default to system Chromium/Google Chrome. Camoufox remains
available when `UNI_BROWSER_CAMOUFOX_BIN` points to a Camoufox installation.
The platform npm package contains the `uni-browser` daemon only; it neither
reinstalls an existing browser nor downloads Chrome or Camoufox on demand.

## Login profiles

Create a profile with **headless disabled**, open it, and sign in yourself in the visible browser. Later opens reuse the same managed profile directory. **Stop** retains it; **Forget** permanently removes it after confirmation.

## Security boundary

This first release is local-only. It uses uni-browser's NDJSON action plane rather than direct CDP/Juggler passthrough, so browser actions remain in uni-browser's audit trail.

**Stop** preserves the profile directory. **Forget** permanently removes its
cookies, local storage, IndexedDB, and other local login state after confirmation.

## Platform support

Prebuilt daemon packages are published for macOS and Linux on Apple Silicon,
x64, and Linux ARM64. Windows is not included in the bundled-runtime matrix;
use an externally managed daemon only if you have a compatible build.

## Maintainer documentation

See [docs/releasing.md](docs/releasing.md) for the runtime version contract,
GitHub release automation, npm Trusted Publishing setup, and recovery steps.

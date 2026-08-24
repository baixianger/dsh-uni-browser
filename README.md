# dsh-uni-browser

Persistent, named browser profiles for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness), powered by a local [uni-browser](https://github.com/baixianger/uni-browser) daemon.

## What it does

- Registers named Camoufox or Chromium profiles in DSH Settings → Uni Browser.
- Opens and stops profiles without losing their local cookies, localStorage, or IndexedDB.
- Lets DSH agents navigate, snapshot, click, type, and press through uni-browser's audited action API.
- Keeps browser passwords, cookies, and daemon tokens out of the DSH UI and tool parameters.

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

## Login profiles

Create a profile with **headless disabled**, open it, and sign in yourself in the visible browser. Later opens reuse the same managed profile directory. **Stop** retains it; **Forget** permanently removes it after confirmation.

## Security boundary

This first release is local-only. It uses uni-browser's NDJSON action plane rather than direct CDP/Juggler passthrough, so browser actions remain in uni-browser's audit trail.

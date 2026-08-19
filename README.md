# dsh-uni-browser

Persistent, named browser profiles for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness), powered by a local [uni-browser](https://github.com/baixianger/uni-browser) daemon.

## What it does

- Registers named Camoufox or Chromium profiles in DSH Settings → Uni Browser.
- Opens and stops profiles without losing their local cookies, localStorage, or IndexedDB.
- Lets DSH agents navigate, snapshot, click, type, and press through uni-browser's audited action API.
- Keeps browser passwords, cookies, and daemon tokens out of the DSH UI and tool parameters.

## Prerequisite

Start a local uni-browser daemon first. The plugin connects to its standard Unix socket (`$UNI_BROWSER_SOCKET`, then `$XDG_RUNTIME_DIR/uni-browser/uni.sock`, then `~/.uni-browser/uni.sock`). It does not start a browser automatically.

## Login profiles

Create a profile with **headless disabled**, open it, and sign in yourself in the visible browser. Later opens reuse the same managed profile directory. **Stop** retains it; **Forget** permanently removes it after confirmation.

## Security boundary

This first release is local-only. It uses uni-browser's NDJSON action plane rather than direct CDP/Juggler passthrough, so browser actions remain in uni-browser's audit trail.

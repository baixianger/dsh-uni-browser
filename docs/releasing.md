# Release and runtime update guide

This document is the maintainer contract between the private `uni-browser`
runtime and the public `dsh-uni-browser` plugin.

## Contract at a glance

`dsh-uni-browser` pulls a specific `uni-browser` GitHub Release. The upstream
repository does not push binaries into this repository and a new upstream
release never changes an already published plugin version.

```text
uni-browser GitHub Release vR
            |
            | authenticated download + SHA256 verification
            v
dsh-uni-browser release workflow
            |
            +-- dsh-uni-browser-darwin-arm64@R
            +-- dsh-uni-browser-darwin-x64@R
            +-- dsh-uni-browser-linux-arm64@R
            +-- dsh-uni-browser-linux-x64@R
            |
            v
       dsh-uni-browser@P
```

- `R` is the runtime version and follows the `uni-browser` release.
- `P` is the plugin version and evolves independently.
- The four optional dependencies in the root `package.json` must all equal
  `R`; their package manifests under `npm/` must use the same version.
- npm selects one platform package from its `os` and `cpu` constraints.
- Platform packages contain the `uni-browser` daemon, not Chrome or Camoufox.
  The plugin reuses a compatible browser already installed on the host.
- npm versions are immutable. Publishing `uni-browser vR+1` cannot alter
  users who installed plugin version `P` pinned to runtime `R`.

## Runtime control path

The platform package exposes its native executable as its package entrypoint.
At first browser action, the plugin resolves the matching optional dependency,
starts `uni-browser daemon serve` under
`~/.dsh/dsh-uni-browser/daemon`, waits for its Unix socket, and sends NDJSON
actions over that socket. Subsequent browser operations do not invoke the CLI
parser again.

`UNI_BROWSER_SOCKET` selects an externally managed daemon and disables managed
startup. `UNI_BROWSER_BIN` overrides only the executable while preserving the
managed daemon behavior.

Browser engines are not installed by this workflow. On macOS and Linux the
plugin looks for common system Chrome/Chromium paths and supplies the discovered
path as `UNI_BROWSER_CHROMIUM_BIN`. Camoufox must be installed separately and
selected with `UNI_BROWSER_CAMOUFOX_BIN`. If the selected browser executable is
missing, `uni-browser` returns an installation error; it does not download a
browser as a side effect. Any future on-demand downloader must be an explicit,
checksummed feature with its own version and cache policy.

## GitHub workflow

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs when a
`v*` tag is pushed. Its jobs are deliberately ordered:

1. **Validate release** verifies that the tag equals the root plugin version,
   all four runtime versions agree, tests pass, and the npm tarball is valid.
2. **Publish runtimes** downloads each native archive and `SHA256SUMS` from the
   private `baixianger/uni-browser` release, verifies the checksum, extracts the
   binary, runs `uni-browser --version`, and publishes the missing platform
   package.
3. **Publish plugin** runs only after all platform packages exist and publishes
   the root package under the `next` dist-tag.

Every publish step first queries npm for the exact version. A failed workflow
can therefore be rerun safely: completed packages are skipped and only missing
work is retried.

## Authentication

GitHub needs one repository secret:

- `UNI_BROWSER_RELEASE_TOKEN`: read access to the private
  `baixianger/uni-browser` GitHub Release.

npm publishing uses [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
with GitHub OIDC. Each of the five npm packages trusts this exact identity:

- GitHub owner: `baixianger`
- Repository: `dsh-uni-browser`
- Workflow filename: `release.yml`
- Permission: direct `npm publish`

The workflow grants `id-token: write`, so npm exchanges GitHub's short-lived
OIDC identity at publish time. Do not add a long-lived npm write token after
Trusted Publishing is configured.

The first version of a brand-new npm package must be created interactively
before its package settings exist. After that one-time bootstrap, configure the
trust relationship with npm CLI 11.12 or newer:

```bash
npm trust github PACKAGE_NAME \
  --file release.yml \
  --repo baixianger/dsh-uni-browser \
  --yes
```

Verify a package's trust relationship with:

```bash
npm trust list PACKAGE_NAME
```

## Release a plugin change without changing the runtime

1. Keep all runtime dependency versions unchanged.
2. Bump the root `package.json` plugin version and refresh `package-lock.json`.
3. Run `npm run check`.
4. Commit the release source.
5. Create and push `v<plugin-version>` pointing at that commit.
6. Wait for the release workflow and verify the npm version and dist-tag.
7. Add the tag and exact source commit to `RELEASES.md` in a bookkeeping commit
   after the tag.

## Adopt a new uni-browser runtime

Suppose upstream has published `uni-browser v0.1.3`:

1. Confirm that its release contains four archives plus `SHA256SUMS`.
2. Change all four root optional dependency versions to `0.1.3`.
3. Change all four manifests under `npm/` to `0.1.3`.
4. Bump the independent plugin version.
5. Run unit tests and a real packaged-binary smoke test covering daemon startup
   and `daemon.ping`.
6. Commit, tag the plugin version, and let the workflow publish the four
   runtime packages before the plugin.

An upstream release alone does nothing to this repository. The recommended
future automation is for `uni-browser` to send a `repository_dispatch` event
that opens a runtime-update pull request here. The pull request may update the
version pin and checksums and run compatibility tests, but it must not publish
or merge automatically. The plugin tag remains the release approval boundary.

## Failure recovery

- A build/package failure means no affected platform package was published;
  fix the source and use a new plugin version/tag.
- An npm publish failure may leave some platform packages published. Rerun the
  same workflow; its exact-version checks skip them.
- Never delete or overwrite an npm runtime version. If a binary is wrong,
  publish a new runtime version and a new plugin version that pins it.
- If Trusted Publishing reports `ENEEDAUTH`, verify the repository and workflow
  filename exactly, confirm `id-token: write`, and inspect
  `npm trust list PACKAGE_NAME`.
- If the private release download fails, verify `UNI_BROWSER_RELEASE_TOKEN` and
  the upstream release asset names before rerunning.

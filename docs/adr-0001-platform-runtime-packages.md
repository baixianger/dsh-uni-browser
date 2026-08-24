# ADR-0001: Distribute uni-browser as npm platform packages

**Status:** Accepted  
**Date:** 2026-08-24  
**Decider:** Repository owner

## Context

The `uni-browser` source repository is private, while `dsh-uni-browser` is a
public npm plugin. Runtime downloads from the private GitHub Release require a
token and are therefore not an out-of-box installation path. A single plugin
package containing all four native binaries would make every installation
download three unused platforms.

## Decision

Publish one public npm package per supported OS/CPU pair and declare the four
packages as exact-version optional dependencies of `dsh-uni-browser`. npm uses
each package's `os` and `cpu` constraints to install only the matching runtime.
The plugin resolves the installed package and starts the daemon directly; all
browser actions continue over the Unix-socket NDJSON protocol.

Runtime package versions follow `uni-browser` releases. Plugin versions remain
independent and pin one exact runtime version.

## Options considered

| Option | Install size | Runtime network | Release complexity |
| --- | --- | --- | --- |
| Bundle all binaries in the plugin | High | None | Low |
| Mirror GitHub Release assets | Low | Required on first use | Medium |
| npm platform packages | Low | None after npm install | Medium |

## Consequences

- A normal npm install becomes self-contained for the current platform.
- `UNI_BROWSER_SOCKET` still selects an externally managed daemon.
- `UNI_BROWSER_BIN` still overrides the packaged binary.
- The release workflow needs read access to the private `uni-browser` Release
  and npm publishing credentials.
- A new `uni-browser` version requires four platform packages before the main
  plugin version that references it is published.

## Release automation

Pushing a plugin version tag validates the exact version graph, downloads and
verifies the four private release assets, publishes missing platform packages,
then publishes the main plugin under the `next` dist-tag.

---
title: "v8.2.0: AIOS Plugins Now Install from GitHub with One Command"
description: "AIOS plugins can add Console pages, integrations, providers, middleware, clients, actions, and usage aggregation. Install one directly from GitHub, pinned to a commit, without running repository build scripts."
date: 2026-11-24
tags: ["AIOS", "v8.2.0", "plugins", "GitHub", "ecosystem", "release"]
---

# v8.2.0: AIOS Plugins Now Install from GitHub with One Command

The plugin system shipped before its front door did. The runtime could load a
manifest and project contributions across the app, but users had no guide, no
one-line GitHub install, and no clear way to submit a plugin. That gap is closed.

## Install

Run this from your project root:

```bash
aios plugin install github:owner/repo#v1.2.3
```

The full GitHub HTTPS URL works too, and `add` is an alias:

```bash
aios plugin add github:owner/repo#v1.2.3
aios plugin install https://github.com/owner/repo
```

AIOS clones the public repository into `.aios/plugins/<id>`, validates the root
`manifest.json`, resolves the requested tag, branch, or SHA to a commit, checks
out that commit in detached HEAD state, and registers the plugin in
`config/plugins.json`.

## What a plugin can add

One manifest can contribute:

- a Console page, including a sandboxed single-file HTML UI;
- a skill/MCP integration through the existing pinned integration registry;
- model/provider data through an isolated child process;
- bounded gateway middleware;
- client connections, actions, and usage aggregation.

The existing local development form remains available:

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

## The safety boundary

AIOS does **not** run repository `build`, `prepare`, `install`, or other package
scripts during a Git install. Authors must ship ready-to-load files. The
installed checkout is pinned, so a later push cannot silently replace the code
you reviewed.

Installing is still a trust decision. Panel HTML runs in a sandboxed iframe,
middleware runs in a restricted VM with timeout and rollback, and provider
entries run in a separate child process with the host's OS privileges. Review
`permissions` and `contributes`, and prefer a tagged release or full commit SHA.

Current limits are explicit: public GitHub HTTPS repositories only, root
`manifest.json`, no automatic updates, no marketplace search, and no npm or SSH
installs yet.

## Build and contribute

The new [Plugin Guide](https://cli.rexai.top/plugins/) documents the manifest
contract, lifecycle commands, runtime boundaries, troubleshooting, and a Pull
Request contribution path.

To contribute a community plugin:

1. Publish a repository with a root `manifest.json`, README, and license.
2. Tag a release and verify both local and GitHub installation.
3. Open a PR adding your plugin to the community table with its repository,
   tested tag or commit, purpose, permissions, and evidence.

Your code stays in your repository. The PR adds a discoverable listing and an
install command other developers can copy.

## Verification

The focused install suite passes 9/9. A real Windows CLI smoke test installed a
plugin from a temporary Git repository through a GitHub-shaped source, verified
the resolved commit, detached checkout, registry entry, panel projection, and
staging cleanup. Independent standards/spec review passed with no findings in
the bounded diff.

Read the [author and contributor guide](https://cli.rexai.top/plugins/) and ship
the extension AIOS was missing.

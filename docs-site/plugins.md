---
title: AIOS Plugins — Install from GitHub, Build, and Contribute
description: "Install an AIOS plugin with one command from GitHub, manage its lifecycle, author a manifest, understand the trust boundary, and submit a community plugin by pull request."
---

# AIOS Plugins — Install, Build, Contribute

> **Quick answer:** run `aios plugin install github:owner/repo#v1.2.3` from your project root. AIOS clones the public repository into `.aios/plugins/<id>`, validates its root `manifest.json`, pins the checkout to the resolved commit, and registers it in `config/plugins.json`. `aios plugin add` is an alias.

## What a plugin can contribute

An AIOS plugin is a directory with a root `manifest.json`. Its `contributes` section can add:

| Contribution | What it adds |
| --- | --- |
| `panels` | A Console navigation page, optionally rendered from a sandboxed single-file HTML UI |
| `integrations` | A declared skill/MCP integration projected through the existing integration registry |
| `providers` | Model/provider data loaded by an isolated child process over stdio JSON-RPC |
| `middleware` | A bounded gateway request hook running in the restricted Node VM runtime |
| `clients` | Client connection declarations reused by the existing connect system |
| `actions` | Declarative action/tool contributions |
| `onUsage` | Gateway usage aggregation |

## Install from GitHub

### Requirements

- Run the command from the **project root** you want to extend.
- Git must be on `PATH`.
- The repository must be public and contain `manifest.json` at its root.
- Ship ready-to-load files. AIOS does **not** run `build`, `prepare`, `install`, or other package scripts.

### One-line install

```bash
# Default branch, resolved and pinned at install time
aios plugin install github:acme/demo

# A tag, branch, or full commit SHA
aios plugin install github:acme/demo#v1.2.3
aios plugin install --ref main github:acme/demo

# DSH-style alias
aios plugin add github:acme/demo#v1.2.3

# A normal GitHub HTTPS URL works too
aios plugin install https://github.com/acme/demo
```

The JSON result reports the plugin id, normalized source, resolved commit, manifest path, and applied contributions:

```json
{
  "ok": true,
  "id": "demo-plugin",
  "source": "github:acme/demo#v1.2.3",
  "commit": "1111111111111111111111111111111111111111",
  "manifest": ".aios/plugins/demo-plugin"
}
```

AIOS checks out the resolved commit in detached HEAD state. Later pushes to the branch or tag do not silently change the installed files.

### Install a local plugin

The existing local form remains supported:

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

This is useful for plugin development and for the repository's `examples/hello-plugin`, whose manifest lives in a subdirectory rather than at the AIOS repository root.

## Manage installed plugins

| Command | Purpose |
| --- | --- |
| `aios plugin list --json` | List registered plugins and their manifest paths |
| `aios plugin disable <id>` | Keep the install but withdraw its contributions |
| `aios plugin enable <id>` | Reapply its contributions |
| `aios plugin remove <id>` | Unregister it and retire its projected contributions |
| `aios plugin providers --json` | Query built-in and plugin providers |
| `aios plugin models --json` | Query built-in and plugin models |

GitHub installs write:

```text
<project>/
├── config/plugins.json                 # lifecycle registry
└── .aios/plugins/<plugin-id>/          # pinned source checkout
```

`remove` does not delete source directories. If you want a clean reinstall of a GitHub plugin, delete `.aios/plugins/<plugin-id>` after removing it, then install again.

## Author a plugin

### Minimal manifest

```json
{
  "schemaVersion": 1,
  "id": "demo-plugin",
  "version": "1.0.0",
  "permissions": ["panel"],
  "lifecycle": {
    "install": "automatic",
    "upgrade": "manual",
    "disable": "toggle",
    "remove": "clean"
  },
  "contributes": {
    "panels": [
      {
        "id": "demo",
        "href": "/demo",
        "label": "Demo",
        "title": "Demo plugin",
        "ui": { "entry": "panel.html" }
      }
    ]
  }
}
```

Rules:

- `id` is lowercase and matches `^[a-z][a-z0-9._-]*$`.
- `version` is SemVer-like, for example `1.2.3` or `1.2.3-beta.1`.
- `ui.entry` is a relative `.html` file inside the plugin directory, at most 256 KiB.
- Provider `entry` paths are relative to the plugin directory.
- Integration declarations still pass through the existing pinned-commit and sha256 validation.

### Runtime and trust boundaries

| Surface | Execution model | Trust note |
| --- | --- | --- |
| Manifest and panel data | Read and projected by the host | No external install scripts run |
| Panel HTML | `iframe sandbox="allow-scripts"` | No same-origin access to host DOM, cookies, or APIs |
| Middleware | Restricted Node VM, timeout, clone/rollback, fail-open | Not a hard security boundary; install only trusted hooks |
| Provider entry | Separate Node child process, stdio JSON-RPC | Executes plugin code with the host process's OS privileges |

Installing a plugin is a trust decision. Prefer a tagged release or full commit SHA, review `permissions` and `contributes`, and inspect provider or middleware code before enabling it.

## Contribute a plugin by pull request

There is no centralized marketplace yet, but community plugin PRs are welcome.

1. Publish your plugin repository with a root `manifest.json`, README, and license.
2. Tag a release and test both local and GitHub installation.
3. Open a PR that adds a row to the community table below with:
   - plugin name and repository URL;
   - tested tag or commit;
   - one-sentence purpose;
   - required permissions;
   - install/test evidence.
4. Keep the plugin installable directly from GitHub; a listing PR does not move your code into the AIOS repository.

Start from the [plugin guide edit page](https://github.com/rexleimo/aios/edit/main/docs-site/plugins.md) or [open an issue](https://github.com/rexleimo/aios/issues).

### Community plugins

| Plugin | Source | Install |
| --- | --- | --- |
| Official `hello-plugin` example | [AIOS repository](https://github.com/rexleimo/aios/tree/main/examples/hello-plugin) | From an AIOS checkout: `aios plugin install --id hello-plugin --dir examples/hello-plugin` |
| Your plugin here | PR welcome | `aios plugin install github:owner/repo#tag` |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `GitHub source must name owner/repo` | Unsupported shorthand or extra URL path | Use `github:owner/repo` or `https://github.com/owner/repo` |
| `git clone failed` | Git missing, network/proxy issue, or private repository | Install Git, check connectivity, or use a public repository |
| `plugin manifest ... is not valid JSON or missing` | No root `manifest.json` | Add a valid manifest at the repository root |
| `manifest id ... != requested ...` | `--id` does not match the manifest | Omit `--id` or use the manifest id |
| `plugin target already exists` | A previous checkout is still present | Run `aios plugin remove <id>`, delete `.aios/plugins/<id>`, then reinstall |
| `plugin ... already installed` | The id is already registered | Disable it, or remove it before reinstalling |
| TypeScript plugin will not load | Git install does not build source | Commit ready-to-load JS or publish prebuilt files |

## Current limits

- Public GitHub HTTPS repositories only; no SSH, private repos, npm packages, or embedded credentials.
- No automatic updates, marketplace search, or signature registry yet.
- The manifest must be at the repository root.
- AIOS never authorizes or runs repository build scripts.

## Next steps

- [Release blog: one-command GitHub plugin installs](https://cli.rexai.top/blog/2026-11-plugin-ecosystem/)
- [Vendor integrations](integrations.md) — pinned skill and MCP integration management.
- [Model Router](model-router.md) — route work across model providers.
- [Architecture](architecture.md) — where plugins sit in the AIOS runtime.

# aios-pi-extension

AIOS control-plane extension for the [Pi coding agent](https://pi.dev)
(`@earendil-works/pi-coding-agent`). Embeds AIOS inside Pi as code —
memory tools, safety gates, and session wiring — instead of prompt-only
guidance.

## Install

Pi packages install from npm or git. Until this package is published,
the supported path is `aios init` (registers the entry below) or the
settings `extensions` entry directly
(`pi install git:…` of the AIOS monorepo is unverified: the manifest
lives in `packages/aios-pi/`, not the repo root):

```bash
aios init --agent pi   # writes the entry into ~/.pi/agent/settings.json
```

Or pin it in Pi settings (`~/.pi/agent/settings.json` or `.pi/settings.json`):

```json
{
  "extensions": ["/path/to/aios/packages/aios-pi/extensions/aios.ts"]
}
```

The extension finds the AIOS root via `AIOS_ROOT_DIR` (or `AIOS_ROOT` /
`ROOTPATH`), falling back to walking up from its own file to
`scripts/aios.mjs`. Without either, tools fail closed with a clear message.

## What it adds

Tools (callable by the model):

| Tool | Backing command |
| ---- | --------------- |
| `aios_memory_recall` | `aios memo search <query> --limit N` |
| `aios_memory_write` | `aios memo add <text>` |
| `aios_memory_useful` | `aios memo useful <ids>` (recall feedback) |
| `aios_skill_search` | `aios search <query> --json` |

Events:

- `tool_call` — blocks destructive shell (`rm -rf`, `--no-preserve-root`,
  fork bombs, `mkfs`, `dd` to devices; terminates the turn) and protected
  writes (`.env*`, `node_modules/`, `.git/`; blocks without terminating).
- `before_agent_start` — injects the AIOS workflow policy plus a short
  memory digest for the turn (works even with `--no-context-files`).
- `session_start` — shows the resolved AIOS root in the status line.

Commands: `/aios-root`, `/aios-policy`.

## Trust and security

- The extension spawns only `node <AIOS_ROOT>/scripts/aios.mjs`; it never
  exfiltrates data and runs no network calls of its own.
- Project-local loading follows Pi trust: `.pi` resources load only after
  `/trust` (or `-a/--approve` for one run). Headless harness runs pass `-a`.
- Pi has no built-in MCP surface, so this extension — not MCP config
  migration — is how AIOS tools reach Pi.

## Verify

```bash
node --test scripts/tests/pi-extension.test.mjs
```

Live load (`pi -p --no-session -e ./packages/aios-pi/extensions/aios.ts …`)
requires a working `pi` install with a configured provider.

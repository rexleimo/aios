---
title: Architecture
description: Runtime architecture for wrappers, runner, and filesystem ContextDB.
---

# Architecture

## Components

- `scripts/contextdb-shell.zsh`: shell wrappers for `codex/claude/gemini`
- `scripts/contextdb-shell-bridge.mjs`: wrap/passthrough decision bridge
- `scripts/ctx-agent.mjs`: unified runtime runner
- `mcp-server/src/contextdb/*`: ContextDB core and CLI commands

## Runtime Flow

```text
User command (codex/claude/gemini)
  -> zsh wrapper
  -> contextdb-shell-bridge.mjs
  -> ctx-agent.mjs
  -> contextdb CLI (init/session/pack/...)
  -> native CLI launch with packed context
```

## Storage Model

Each wrapped workspace has its own local store (git root if available, otherwise current directory):

```text
.aios/context-db/
  manifest.json
  index/sessions.jsonl
  sessions/<session_id>/
  exports/<session_id>-context.md
```

## Isolation Controls

Set wrapper scope with `CTXDB_WRAP_MODE`:

- `all`: wrap in all workspaces, including non-git directories
- `repo-only`: only wrap in the `ROOTPATH` workspace
- `opt-in`: wrap only when marker exists (default marker: `.contextdb-enable`)
- `off`: disable wrapping

Use `opt-in` if you want strict project-by-project control.

## Harness Layer (AIOS)

AIOS adds an operator-facing harness on top of ContextDB:

- `aios orchestrate` builds a local dispatch DAG from blueprints.
- `dry-run` execution uses `local-dry-run` (token-free simulation).
- `live` execution uses `subagent-runtime` and runs phase jobs via Codex CLI (`codex`) (currently codex-only).
- When using `AIOS_SUBAGENT_CLIENT=codex-cli`, AIOS prefers `codex exec` structured outputs (`--output-schema`, `--output-last-message`, stdin) for stable JSON handoffs (falls back for older versions).
- Solo harness iterations record an explicit stage (`research`, `requirements`, `planning`, `development`, `validation`, `handoff`) plus evidence, then persist per-iteration ContextDB checkpoints when a session exists.

### Team Operations (HUD & Team Status)

AIOS provides real-time visibility into agent sessions:

- **HUD** (`aios hud`): Per-session dashboard showing goal, dispatch status, quality-gate outcomes, and skill candidates
- **Team Status** (`aios team status`): Aggregated view across recent sessions
- **Team History** (`aios team history`): Historical analysis with quality-gate filtering and hindsight patterns
- **Skill Candidates** (`aios team skill-candidates`): Automated improvement suggestions from failed sessions

See [Agent Team & HUD](team-ops.md) for usage details.

Live execution is opt-in and gated by:

- `AIOS_EXECUTE_LIVE=1`
- `AIOS_SUBAGENT_CLIENT=codex-cli`

### Browser MCP (browser-use CDP)

As of 2026-04-10, the default browser MCP runtime is **browser-use MCP over CDP**:

- Launcher: `scripts/run-browser-use-mcp.sh`
- Migration: `aios internal browser mcp-migrate`
- Tools: `chrome.launch_cdp`, `browser.connect_cdp`, `page.*`, `diagnostics.sannysoft`
- Profile config: `config/browser-profiles.json`
- Screenshot timeout guard: `BROWSER_USE_SCREENSHOT_TIMEOUT_MS` (default: 15s)

Legacy Playwright MCP (`mcp-server/`) is retained for compatibility but is no longer the default.

## RL Training Layer (AIOS)

AIOS includes a multi-environment reinforcement learning system that continuously improves a shared student policy across shell, browser, and orchestrator tasks.

### Shared Control Plane (`scripts/lib/rl-core/`)

```
campaign-controller.mjs   # epoch orchestration (collection + monitoring)
checkpoint-registry.mjs  # active / pre_update_ref / last_stable lineage
comparison-engine.mjs    # better / same / worse / comparison_failed
control-state-store.mjs  # restart-safe control snapshots
epoch-ledger.mjs         # epoch state + degradation streaks
replay-pool.mjs          # four-lane routing (positive/neutral/negative/diagnostic)
reward-engine.mjs       # environment reward + teacher shaping fusion
teacher-gateway.mjs      # normalized teacher outputs (Codex/Claude/Gemini/opencode)
schema.mjs               # shared contract validation
trainer.mjs              # PPO entry points (online + offline)
```

### Environment Adapters

| Adapter | Path | Training Focus |
|---------|------|---------------|
| Shell RL | `scripts/lib/rl-shell-v1/` | Synthetic bugfix tasks → real repositories |
| Browser RL | `scripts/lib/rl-browser-v1/` | Controlled real web flows |
| Orchestrator RL | `scripts/lib/rl-orchestrator-v1/` | High-value control decisions |
| Mixed RL | `scripts/lib/rl-mixed-v1/` | Cross-environment joint training |

### Key RL Concepts

- **Episode contract**: uniform structured output across all environments (taskId, trajectory, outcome, reward, comparison)
- **Three-pointer checkpoint lineage**: `active` → `pre_update_ref` → `last_stable` with automatic rollback on degradation
- **Four-lane replay pool**: positive / neutral / negative / diagnostic_only — deterministic routing by comparison result
- **Teacher gateway**: normalized signal from Codex CLI, Claude Code, Gemini CLI, and OpenCode

### Running RL

```bash
# Shell RL pipeline
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval

# Mixed-environment campaign
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
```

### RL Status

- RL Core: stable (40+ tests)
- Shell RL V1: stable (Phase 1–3)
- Browser RL V1: beta
- Orchestrator RL V1: beta
- Mixed RL: experimental (end-to-end validated)

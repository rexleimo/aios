# Kiro CLI Support Design

**Date**: 2026-05-12  
**Status**: Draft  
**Scope**: Add Kiro CLI as a first-class supported client in the AIOS workspace

## Problem

The repo currently treats `codex`, `claude`, `gemini`, and `opencode` as first-class clients. Kiro CLI is not represented in the client registry, shell bridge, native sync manifest, or docs. That means Kiro cannot receive the same ContextDB, steering, and MCP bootstrap behavior that the other clients get.

## Evidence

- `scripts/lib/lifecycle/options.mjs` hard-codes `CLIENT_NAMES = ['all', 'codex', 'claude', 'gemini', 'opencode']`.
- `scripts/lib/platform/paths.mjs` only defines homes for those four clients.
- `scripts/lib/components/shell.mjs` and `scripts/contextdb-shell.{zsh,ps1}` only wrap those four commands.
- `config/native-sync-manifest.json` only emits native artifacts for those four clients.
- `scripts/lib/harness/subagent-runtime.mjs` only accepts `codex-cli`, `claude-code`, `gemini-cli`, `opencode-cli` as live subagent clients.

Kiro CLI docs indicate a terminal CLI entrypoint plus workspace steering and MCP support, so it fits the same client-adapter pattern, but not necessarily the same live subagent runtime contract.

## Recommendation

Implement Kiro in two stages.

### Stage 1: Compatibility client

Add Kiro to the repo's client surface so it can receive the same project memory, shell bridge, steering sync, and MCP bootstrap behavior as the other clients.

Kiro does not use the repo's existing skill-pack layout as-is, so stage 1 should treat `skills` as unsupported for Kiro unless a Kiro-specific discoverable format is added later.

### Stage 2: Runtime execution

Only add Kiro to `team` / `subagent` / `harness` live execution if the CLI can produce a stable structured handoff that matches the current runtime contract.

## Options

### Option A: Compatibility client only

Add `kiro` / `kiro-cli` to the registry, shell bridge, native sync, and docs. Keep live team/subagent execution out of scope for now.

Trade-off: lowest risk, delivers immediate value, and matches what the repo already does for other compatibility clients.

### Option B: Full runtime client

Add Kiro to the compatibility layer and also to live `team` / `subagent` / `harness` execution paths.

Trade-off: more complete, but riskier because the current runtime assumes specific agent command shapes and structured outputs.

### Option C: Alias-only support

Expose a shell alias for Kiro and stop there.

Trade-off: too shallow; it would not make Kiro a real supported client in the repo's registry or native sync flow.

## File Map

- `scripts/lib/lifecycle/options.mjs`
- `scripts/lib/platform/paths.mjs`
- `scripts/lib/components/shell.mjs`
- `scripts/contextdb-shell.zsh`
- `scripts/contextdb-shell.ps1`
- `scripts/contextdb-shell-bridge.mjs`
- `scripts/lib/components/native.mjs`
- `scripts/lib/native/source-tree.mjs`
- `config/native-sync-manifest.json`
- `scripts/lib/components/browser.mjs` if Kiro should inherit MCP bootstrap discovery
- `scripts/lib/cli/help.mjs`
- `scripts/tests/*` for registry, wrapper, and native-sync coverage
- `README-zh.md` and `CLAUDE.md` for user-facing client lists

## Proposed Behavior

### Client registration

- Add `kiro` to the client lists used by setup/update/uninstall and home-dir resolution.
- Treat Kiro home as `~/.kiro` by default, with optional `KIRO_HOME` override.
- Keep `skills` as a warning/skip path for Kiro in stage 1; steering should come from native sync instead.

### Shell bridge

- Add a `kiro` shell function and a `kiro-cli` passthrough mapping.
- The passthrough command should prefer `kiro-cli` rather than `kiro`, because `kiro` may be reserved by the IDE launcher.

### Native sync

- Emit Kiro workspace steering files under `.kiro/steering/`.
- Emit Kiro MCP settings under `.kiro/settings/mcp.json` if we want the same repo-local browser MCP bootstrap path to be visible to Kiro.
- Keep root `AGENTS.md` as the authoritative shared policy file.

### Docs and help

- Update supported-client lists and examples to mention Kiro where the repo describes supported clients.
- Keep the wording explicit that Kiro is supported as a compatibility client first, not yet as a live subagent runtime.

## Acceptance Criteria

- `setup`, `update`, and `uninstall` accept `--client kiro`.
- The shell bridge can wrap Kiro CLI without breaking existing commands.
- Native sync can materialize Kiro workspace files.
- Existing clients still pass their current tests unchanged.
- The docs clearly state Kiro support level and any runtime limits.

## Out of Scope For Stage 1

- Adding Kiro to `AIOS_SUBAGENT_CLIENT`.
- Adding Kiro to `team` / `subagent` live execution providers.
- Changing the existing codex/claude/gemini/opencode behavior.

## Open Assumption

This design assumes Kiro CLI is invoked as `kiro-cli` in terminal mode, while `kiro` may remain reserved for the IDE-oriented launcher.

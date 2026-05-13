# Kiro CLI Support Design

**Date**: 2026-05-12  
**Status**: Draft  
**Scope**: Add Kiro CLI as a deep supported client in the AIOS workspace

## Problem

The repo currently treats `codex`, `claude`, `gemini`, `opencode`, and `kiro` as first-class clients. Kiro CLI is now represented across the client registry, shell bridge, native sync manifest, skills sync, and docs so it can receive the same ContextDB, steering, MCP bootstrap, skills, and agent behavior.

## Evidence

- `scripts/lib/lifecycle/options.mjs` hard-codes `CLIENT_NAMES = ['all', 'codex', 'claude', 'gemini', 'opencode']`.
- `scripts/lib/platform/paths.mjs` only defines homes for those four clients.
- `scripts/lib/components/shell.mjs` and `scripts/contextdb-shell.{zsh,ps1}` only wrap those four commands.
- `config/native-sync-manifest.json` only emits native artifacts for those four clients.
- `scripts/lib/harness/subagent-runtime.mjs` accepts `kiro-cli` for explicit live subagent execution.

Kiro CLI docs indicate a terminal CLI entrypoint plus workspace steering, MCP support, custom agents, hooks, and skills. The repository maps those capabilities into the same deep client-adapter pattern used by Codex and Claude.

## Recommendation

Add Kiro to the repo's client surface so it can receive the same project memory, shell bridge, steering sync, MCP bootstrap, skills, agent generation, and explicit runtime execution behavior as the other clients.

## Options

### Option A: Deep native client

Add `kiro` / `kiro-cli` to the registry, shell bridge, native sync, agent generation, skills sync, and live runtime paths.

Trade-off: more work up front, but it aligns the implementation with how Codex and Claude are treated.

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
- Generate `.kiro/agents/*.json`, `.kiro/steering/AIOS.md`, `.kiro/settings/mcp.json`, and `.kiro/skills`.

### Shell bridge

- Add a `kiro` shell function and a `kiro-cli` passthrough mapping.
- The passthrough command should prefer `kiro-cli` rather than `kiro`, because `kiro` may be reserved by the IDE launcher.

### Native sync

- Emit Kiro workspace steering files under `.kiro/steering/`.
- Emit Kiro MCP settings under `.kiro/settings/mcp.json` if we want the same repo-local browser MCP bootstrap path to be visible to Kiro.
- Keep root `AGENTS.md` as the authoritative shared policy file.

### Docs and help

- Update supported-client lists and examples to mention Kiro where the repo describes supported clients.
- Keep the wording explicit that Kiro is supported as a deep client with explicit live runtime selection.

## Acceptance Criteria

- `setup`, `update`, and `uninstall` accept `--client kiro`.
- The shell bridge can wrap Kiro CLI without breaking existing commands.
- Native sync can materialize Kiro workspace files, including agents and skills.
- Existing clients still pass their current tests unchanged.
- The docs clearly state Kiro support level and any runtime limits.

## Out of Scope For Stage 1

- Changing the existing codex/claude/gemini/opencode behavior.

## Open Assumption

This design assumes Kiro CLI is invoked as `kiro-cli` in terminal mode, while `kiro` may remain reserved for the IDE-oriented launcher.

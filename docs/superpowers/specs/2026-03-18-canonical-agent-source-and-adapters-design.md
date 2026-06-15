# Canonical Agent Source And Emitter Sync V1 Design

Date: 2026-03-18

## Goal

Define a single canonical repository source for orchestrator agents, then generate the current compatibility spec and repo-local client agent files from that source.

V1 only covers:
- canonical source,
- compatibility export,
- emitter split,
- deterministic sync behavior.

V1 does not redesign the live runtime. Runtime capability and adapter selection will be handled in a follow-on spec.

## Problem

Current agent management mixes source-of-truth data and generated outputs:
- `scripts/lib/specs/orchestrator-agents.json` is hand-edited but also acts as a compatibility format,
- `.claude/agents/*.md` and `.codex/agents/*.md` are generated directly from that compatibility format,
- sync ownership rules exist in code, but they are not expressed as a formal source-plus-emitter contract.

That creates two problems:
- the canonical data model is constrained by current generated output shape,
- future client support would require editing the current compatibility spec instead of adding a new emitter.

## Scope

In scope:
- introduce `agent-sources/` as the only hand-edited source tree for orchestrator agents,
- define a concrete manifest and per-agent schema,
- generate `scripts/lib/specs/orchestrator-agents.json` from canonical source,
- generate `.claude/agents/*.md` and `.codex/agents/*.md` from canonical source,
- formalize managed-file ownership, collision handling, stale-file removal, and staged sync,
- inventory existing repo integrations that depend on agent generation.

Out of scope:
- runtime capability registry,
- live client selection logic,
- Codex/Claude/Gemini/OpenCode native host protocol support,
- new agent families beyond the current orchestrator role cards,
- any change to the handoff payload schema or phase graph.

## V1 Architecture

V1 has three units:

1. Canonical source loader
   - reads and validates `agent-sources/`
2. Compatibility/export renderer
   - emits `scripts/lib/specs/orchestrator-agents.json`
3. Client emitters plus sync
   - emit `.claude/agents/*.md` and `.codex/agents/*.md`
   - own filesystem sync rules

The orchestrator runtime continues reading the existing compatibility export in v1.

## Canonical Source

### Directory Layout

```text
agent-sources/
  manifest.json
  roles/
    rex-planner.md
    rex-implementer.md
    rex-reviewer.md
    rex-security-reviewer.md
```

V1 supports only this exact authoring layout. There are no extra source subdirectories in this spec.

### Manifest Schema

`agent-sources/manifest.json` is required and must contain:

- `schemaVersion`: integer, must equal `1`
- `generatedTargets`: array, must equal the resolved client agent targets, currently `["claude", "codex", "opencode", "crush"]`

Example:

```json
{
  "schemaVersion": 1,
  "generatedTargets": ["claude", "codex", "opencode", "crush"]
}
```

`generatedTargets` is fixed in v1. There is no per-agent target filtering in this spec.
`generatedTargets` is constraining metadata in v1: every resolved sync target must be a member of this list.

### 2026-06-15 Revision: Markdown Role Cards Are The Authoring Source

The original v1 design used `agent-sources/roles/*.json` as the authoring source. That proved hard to maintain once ECC-style role cards grew into full prompts because every body edit required JSON escaping and made reviews noisy.

Current rule:
- `agent-sources/roles/<id>.md` is the canonical author-maintained source.
- YAML frontmatter stores structured fields such as `schemaVersion`, `id`, `role`, `name`, `description`, `tools`, `model`, `workflowSteps`, and `handoffTarget`.
- The Markdown body is the full `systemPrompt`.
- `scripts/lib/specs/orchestrator-agents.json` remains the generated runtime compatibility export.
- Legacy `roles/*.json` is accepted only when callers explicitly opt into `allowLegacyJsonRoles` for migration or compatibility tests; default canonical loading rejects JSON role sources so new authoring cannot drift back to JSON.

### Per-Agent Schema

Each file under `agent-sources/roles/*.md` contains exactly one agent definition.
The filename must equal `<id>.md`.

Required fields:
- `schemaVersion`: integer, must equal `1`
- `id`: kebab-case string, unique across the source tree
- `role`: enum `planner | implementer | reviewer | security-reviewer`
- `name`: non-empty string
- `description`: non-empty string
- `tools`: string array, may be empty
- `model`: non-empty string
- `handoffTarget`: enum `next-phase | merge-gate`
- Markdown body: non-empty `systemPrompt` content

Optional metadata fields include `recommendedModel`, `fallbackModel`, `tokenProfile`, `activationHints`, `workflowSteps`, `promptDefense`, and `outputContract` where supported by the loader.

Validation closure rules:
- unknown keys are rejected
- `name`, `description`, `model`, and every `tools[]` item must be single-line strings
- `systemPrompt` may be multiline
- no string field may contain either managed marker string:
  - `<!-- AIOS-GENERATED: orchestrator-agents v1 -->`
  - `<!-- END AIOS-GENERATED -->`

Example:

```markdown
---
schemaVersion: 1
id: "rex-implementer"
role: "implementer"
name: "rex-implementer"
description: "Implementer role card for scoped code changes and verification."
tools: ["Read", "Grep", "Glob", "Bash", "Edit"]
model: "sonnet"
workflowSteps: ["inspect-assigned-scope", "apply-minimal-change", "run-required-verification", "return-structured-json-handoff"]
outputContract: "JSON handoff object with status, files changed, evidence, blockers, and next steps."
handoffTarget: "next-phase"
---

# Implementer Agent

## When to use
Use this role for scoped implementation after planning is complete.

## Mission
Own code changes inside the agreed file scope and report concrete results.

## Workflow
1. Inspect the assigned scope.
2. Apply the smallest safe change.
3. Run required verification.
4. Return a structured JSON handoff.

## Hard constraints
Do not expand scope or claim completion without evidence.

## Evidence
Attach command output, diff references, or blockers.

## Output contract
Return the required JSON handoff object.
```

### Source Rules

- `agent-sources/` is the only hand-edited repository source for orchestrator agents.
- role-to-agent mapping is derived from each agent file's `role` and `id`.
- exactly one agent must exist for each role in v1.
- duplicate roles or duplicate ids are fatal validation errors.
- in default canonical mode, only `agent-sources/roles/*.md` is accepted; `*.json` is fatal unless `allowLegacyJsonRoles` is explicitly enabled for migration tests.
- unexpected subdirectories under `agent-sources/` are fatal validation errors.

## Compatibility Export

### Export Target

Generated file:

```text
scripts/lib/specs/orchestrator-agents.json
```

### Export Contract

The export format remains the current compatibility shape:
- `schemaVersion`
- `roleMap`
- `agents`

Each exported agent entry contains:
- `name`
- `description`
- `tools`
- `model`
- `role`
- `handoffTarget`
- `systemPrompt`

### Mapping Rule

V1 canonical source is intentionally defined so the compatibility export is lossless.

Field mapping:
- `id` -> compatibility object key
- `role` -> `roleMap[role]` and agent `role`
- `name` -> `name`
- `description` -> `description`
- `tools` -> `tools`
- `model` -> `model`
- `handoffTarget` -> `handoffTarget`
- `systemPrompt` -> `systemPrompt`

If a future requirement cannot fit this mapping, that belongs in a later schema version, not in v1.

## Client Emitters

### V1 Targets

V1 target ids:
- `claude`
- `codex`

Target paths:
- `claude` -> `.claude/agents/<id>.md`
- `codex` -> `.codex/agents/<id>.md`

### Emitter Contract

Each emitter receives:
- normalized canonical agent object,
- target id

Each emitter returns:
- `targetRelPath`
- `content`

Constraints:
- one emitter produces exactly one file per agent
- emitters are pure renderers and do not access the filesystem
- output must be deterministic for identical input
- emitters never receive filesystem state or repository root

### Rendering Rules

Claude emitter:
- emits Markdown with this exact shape:
  - YAML frontmatter
  - blank line
  - managed marker line
  - blank line
  - role line
  - blank line
  - system prompt body
  - blank line
  - output-contract guidance block
  - blank line
  - end marker line
- frontmatter key order is fixed:
  - `name`
  - `description`
  - `tools`
  - `model`
- managed marker must be `<!-- AIOS-GENERATED: orchestrator-agents v1 -->`
- end marker must be `<!-- END AIOS-GENERATED -->`

Codex emitter:
- uses the same structural rules and marker strings as the Claude emitter in v1

Normative Markdown example:

```md
---
name: rex-planner
description: "Planner role"
tools: ["Read"]
model: sonnet
---

<!-- AIOS-GENERATED: orchestrator-agents v1 -->

Role: planner

You are the planner.

Output Contract
Output a single JSON object (no surrounding text) that conforms to `memory/specs/agent-handoff.schema.json`.

Required fields:
- schemaVersion
- status
- fromRole
- toRole
- taskTitle
- contextSummary
- findings
- filesTouched
- openQuestions
- recommendations

Set `fromRole=planner` and `toRole=next-phase`.

<!-- END AIOS-GENERATED -->
```

Deterministic serialization rules:
- JSON source parsing is normalized before rendering
- compatibility export keys are written in fixed order: `schemaVersion`, `roleMap`, `agents`
- `roleMap` keys are written in role order: `planner`, `implementer`, `reviewer`, `security-reviewer`
- `agents` object keys are written in lexicographic `id` order
- compatibility export agent field order is fixed: `name`, `description`, `tools`, `model`, `role`, `handoffTarget`, `systemPrompt`
- Markdown output always uses LF line endings
- Markdown output must end with exactly one trailing newline
- compatibility export must use UTF-8, LF line endings, two-space indentation, and exactly one trailing newline

Normative compatibility export example:

```json
{
  "schemaVersion": 1,
  "roleMap": {
    "planner": "rex-planner",
    "implementer": "rex-implementer",
    "reviewer": "rex-reviewer",
    "security-reviewer": "rex-security-reviewer"
  },
  "agents": {
    "rex-planner": {
      "name": "rex-planner",
      "description": "Planner role card for AIOS orchestrations (scope, risks, ordering).",
      "tools": [
        "Read",
        "Grep",
        "Glob"
      ],
      "model": "sonnet",
      "role": "planner",
      "handoffTarget": "next-phase",
      "systemPrompt": "You are the Planner. Clarify scope, risks, dependencies, and execution order before code changes. Produce a concrete plan that an implementer can follow."
    }
  }
}
```

### Managed Ownership Rules

Managed file definition:
- a file is managed if and only if all are true:
  - the file starts with YAML frontmatter opening line `---`
  - the frontmatter closes with the next standalone line `---`
  - the first content line after that closing delimiter is exactly `<!-- AIOS-GENERATED: orchestrator-agents v1 -->`
  - the last non-empty line is exactly `<!-- END AIOS-GENERATED -->`
  - the filename matches `<id>.md`

Overwrite rule:
- existing managed files may be replaced during successful sync
- existing unmanaged files must never be overwritten

Skip rule:
- if a target path exists but does not satisfy the managed-file predicate exactly, sync fails with an unmanaged-conflict error before any write occurs

### Collision And Failure Rules

Collision rule:
- if two rendered outputs resolve to the same `targetRelPath`, sync fails before writing any files

Staging rule:
- sync writes rendered compatibility export and rendered target files into a temporary staging area first
- validation and collision checks must pass before any managed target is replaced

Partial failure rule:
- if staging or validation fails, existing files remain unchanged
- commit order is:
  - move stale managed target files for the selected roots into a temporary trash area
  - write replacement managed target files
  - write `scripts/lib/specs/orchestrator-agents.json` last
- if stale-file move fails, the commit aborts before any replacement write
- if any target-file replacement fails, compatibility export is not updated and moved stale files are restored from the temporary trash area
- if final compatibility export write fails, sync restores moved stale files and replacement target files from the pre-commit backups, then exits non-zero
- on any commit failure, the expected end state is: managed target files unchanged and compatibility export unchanged

### Stale Managed File Removal

After a successful staged sync, stale managed files are removed when both are true:
- the file lives under the selected target root,
- the file is managed by this sync system,
- the file is not present in the newly rendered expected set

This applies to:
- deleted source agents,
- renamed source ids,
- target-specific uninstall via empty rendered set.

Unmanaged files are never removed by sync.

## Sync Entrypoints

V1 sync entrypoints:
- library entrypoint for setup/update/uninstall flows
- `scripts/generate-orchestrator-agents.mjs` for explicit regeneration

Target selection semantics in v1:
- `client=claude` -> target set `["claude"]`
- `client=codex` -> target set `["codex"]`
- `client=all` -> target set `["claude", "codex"]`
- `client=gemini` -> target set `["claude", "codex"]`
- `client=opencode` -> target set `["claude", "codex"]`

Rationale:
- current lifecycle surface already exposes `gemini` and `opencode`
- v1 keeps behavior compatible by treating those selections as compatibility-catalog installs, not native client roots

Setup/update behavior:
- read canonical source
- generate compatibility export
- render selected targets
- perform staged sync

Uninstall behavior:
- keep canonical source unchanged
- render an empty expected set for the selected target roots
- remove stale managed files only

Unsupported client behavior in v1:
- any client value outside `all|claude|codex|gemini|opencode` is an argument error

## Integration Inventory

V1 implementation planning must cover these existing repo surfaces:

- Source and rendering
  - `scripts/lib/harness/orchestrator-agents.mjs`
  - `scripts/generate-orchestrator-agents.mjs`
  - `scripts/lib/specs/orchestrator-agents.json`

- Orchestrator consumers of compatibility export
  - `scripts/lib/harness/orchestrator.mjs`
  - `scripts/lib/harness/subagent-runtime.mjs`

- Install/update/uninstall entrypoints
  - `scripts/lib/components/agents.mjs`
  - `scripts/lib/lifecycle/setup.mjs`
  - `scripts/lib/lifecycle/update.mjs`
  - `scripts/lib/lifecycle/uninstall.mjs`

- CLI/operator entrypoints
  - `scripts/lib/cli/help.mjs`
  - `scripts/lib/lifecycle/options.mjs`

- Packaging and release validation
  - `agent-sources/**`
  - `scripts/package-release.sh`
  - `scripts/package-release.ps1`
  - `scripts/release-preflight.sh`

- Security scanning
  - `agent-sources/**`
  - `scripts/doctor-security-config.mjs`

- Tests
  - `scripts/tests/aios-orchestrator-agents.test.mjs`
  - `scripts/tests/aios-components.test.mjs`
  - `scripts/tests/aios-orchestrator.test.mjs`
  - `scripts/tests/release-pipeline.test.mjs`

- Operator docs to re-check after the change
  - `README.md`
  - `README-zh.md`

## Error Handling

- invalid manifest fails before any generation work
- invalid per-agent schema fails before any generation work
- duplicate id or duplicate role fails validation
- compatibility export validation failure is fatal
- emitter collision is fatal
- unmanaged target conflict is fatal
- partial sync failure leaves existing files unchanged

Compatibility export validation failure means one of:
- the rendered export does not parse as valid JSON,
- the parsed export does not satisfy the compatibility schema shape,
- `roleMap` does not contain exactly the four required roles,
- `agents` does not contain exactly the four expected ids from canonical source.

## Testing And Verification

Required automated tests:
- manifest validation
- per-agent schema validation
- role uniqueness validation
- unexpected source-tree entries fail validation
- compatibility export generation
- deterministic Claude emitter output
- deterministic Codex emitter output
- collision-before-write behavior
- managed vs unmanaged sync behavior
- stale managed file removal
- uninstall removes only managed files
- final compatibility-export write failure rolls back managed target changes
- release packaging still includes `agent-sources/` and generated agent roots
- security doctor still scans `agent-sources/` and generated agent roots

Required manual verification:
- inspect generated `.claude/agents` and `.codex/agents`
- run setup/update/uninstall with the `agents` component
- run orchestrator smoke checks that still consume `scripts/lib/specs/orchestrator-agents.json`
- perform the initial cutover by generating from `agent-sources/` and confirming byte-for-byte equality with the pre-cutover committed compatibility export and generated agent files before switching repository authority

## Rollback

Rollback path:
- restore `scripts/lib/specs/orchestrator-agents.json` as the hand-edited source of truth
- point sync/render logic back to the compatibility export path
- stop reading `agent-sources/`
- keep existing generated target directories intact until a later cleanup change

## Follow-On Spec

Not part of this document:
- runtime capability registry,
- structured vs plain fallback runtime selection,
- provider-specific native host integrations.

Those belong in a separate runtime-focused spec after v1 source/export/emitter sync is landed.

## Acceptance Criteria

This spec is ready for implementation planning when all are true:
- `agent-sources/` is the only hand-edited repository source for orchestrator agents
- manifest and per-agent schemas are concrete enough to validate mechanically
- `scripts/lib/specs/orchestrator-agents.json` is a generated compatibility export
- `.claude/agents` and `.codex/agents` are generated from canonical source
- sync ownership, collision handling, stale-file removal, and failure behavior are explicit
- current orchestrator consumers can continue reading the compatibility export in v1
- runtime redesign is explicitly deferred to a separate spec

---
name: harness-init-runner
description: Initialize a lightweight Node.js long-running agent harness (harness/ + .harness/) with a cross-provider runner that can drive codex/claude/gemini/opencode CLIs, capturing prompts, logs, and checkpoints.
---

# Harness Init Runner (Node.js)

Create a portable long-running-agent harness inside the **current repo** (Node.js), without pulling in the full AIOS workspace layout.

## When to use (even if AIOS is installed)

- Use this when you want a **repo-local**, lightweight `harness/` runner that works across Codex / Claude Code / Gemini / opencode.
- If you already use AIOS, you may not need this. However it can coexist: this skill creates `harness/` + `/.harness/` and does not depend on `scripts/aios.mjs`.

## What this skill generates (repo root)

- `harness/` (runner code)
- `harness.config.json` (provider command templates)
- `/.harness/` (runtime artifacts root; gitignored)
- `package.json` scripts: `harness:run`, `harness:doctor`
- dependency: `zod`

Runtime artifacts are written under `./.harness/runs/*` and must not be committed.

## Preconditions

- Run from (or inside) a Node.js repo that has a `package.json`.
- If `package.json` is missing, stop and ask the user whether to create a Node project first.

## Init Steps (deterministic)

1. Locate repo root by searching upward for `package.json`.
2. Copy the bundled templates from `assets/template/` into the target repo root:
   - copy `assets/template/harness/` → `<repoRoot>/harness/`
   - copy `assets/template/harness.config.json` → `<repoRoot>/harness.config.json` (do not overwrite if user has edits; merge instead)
3. Append `/.harness/` to `<repoRoot>/.gitignore` (create file if missing).
4. Update `<repoRoot>/package.json` (additive only):
   - Add scripts:
     - `harness:run`: `node harness/run.mjs`
     - `harness:doctor`: `node harness/doctor.mjs`
   - Add dependency `zod` (use `dependencies` unless the repo clearly wants `devDependencies`).
5. Run `npm install`.
6. Verify:
   - `npm run harness:doctor`
   - `npm run harness:run -- --provider codex --task "hello harness"`

## Safety defaults

- The runner performs a lightweight “human gate” check on the task text for auth/payment/policy + sensitive command keywords.
- If blocked, it exits with a non-zero code and prints reasons.
- Operator can bypass using `--allow-risk`.

## Notes for multi-client compatibility

- The runner shells out to provider CLIs; exact CLI flags vary by tool/version.
- Default provider configs are intentionally minimal; users should adjust `harness.config.json` for their environment.

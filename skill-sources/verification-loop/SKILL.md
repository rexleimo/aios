---
name: verification-loop
description: Evidence-before-assertions workflow. Use before claiming work is done, before release, and after any behavior change in scripts/skills/MCP.

installCatalogName: verification-loop
clients: [codex, claude, gemini, opencode]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, verification]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush]
---

# Verification Loop

## Trigger
Use this skill when:
- You changed runtime behavior (scripts, wrappers, MCP server, install flows)
- You are about to say "done", "fixed", "works", or "passes"
- You are about to bump version / release

## Rules
- Prefer commands with deterministic exit codes over "it looks fine".
- If you cannot run verification, say exactly what you could not run and why.

## Baseline Checks (AIOS)
1. Run the verifier:
   - `aios doctor`
   - Or: `node scripts/aios.mjs doctor`
   - Compatibility wrappers: `scripts/verify-aios.sh` / `scripts/verify-aios.ps1`

2. MCP server changes (minimum):
   - `cd mcp-server && npm run typecheck`
   - `cd mcp-server && npm run build`
   - Manual smoke: `chrome.launch_cdp` -> `browser.connect_cdp` -> `page.goto` -> `page.extract_text`/`page.screenshot` -> `browser.close`

3. Install/wrapper changes:
   - Re-run install/update on a clean-ish shell session.
   - Confirm new commands are visible and resolve to `ROOTPATH` scripts.

## Evidence Capture
- Record the exact commands run and whether they succeeded.
- For failures: include the first actionable error line and the remediation you applied.

## Structured Verdict Schema

Inspired by the-pair v2.0.2 `quality_gate.rs`: every completion claim MUST be
backed by a structured verdict with exactly four sections. A verdict missing any
section is an **automatic REJECT** — there is no partial credit.

The four required sections, in order:

1. **FILES_REVIEWED** — list of files reviewed with line ranges and change status.
2. **CHECKS** — typecheck, test suite, lint — each with a concrete PASS/FAIL status.
3. **CODE** — the specific code snippet or issue reference, as a quoted block.
4. **VALIDATION** — summary verdict: `APPROVED` or `REJECTED`, followed by specific
   `next_actions` when rejected.

### Mandatory format

```
VERDICT:
FILES_REVIEWED:
  - path/to/file.ts: lines 45-67 (changed)
CHECKS:
  - typecheck: PASS
  - test suite: PASS (8/8)
  - lint: PASS
CODE:
  > // specific snippet or issue reference
VALIDATION:
  APPROVED — all checks pass
  OR
  REJECTED — [specific next_actions list]
```

Rules:
- All four section headers (`FILES_REVIEWED:`, `CHECKS:`, `CODE:`, `VALIDATION:`)
  MUST be present, each on its own line, followed by a non-empty body.
- A section header with no body counts as missing → REJECT.
- `CHECKS` MUST enumerate concrete commands with PASS/FAIL, not "looks fine".
- `CODE` MUST quote the exact snippet under review or the exact issue — never a
  paraphrase.
- `VALIDATION` MUST start with `APPROVED` or `REJECTED`. If `REJECTED`, it MUST
  list specific, actionable next steps.

### Verdict validator

Completeness is machine-checkable with no LLM calls. The validator lives at
`scripts/lib/skills/verdict-schema.mjs` and exposes two functions:

- `parseVerdictText(text)` → extracts the four sections from a verdict block and
  records which headers were present.
- `validateVerdictCompleteness(parsed)` → returns
  `{ approved, missing_sections, empty_sections, next_actions }`. `approved` is
  `true` only when all four sections are present and non-empty.

Use the validator as a gate before asserting "done": if it returns
`approved: false`, the verdict is rejected and the listed `next_actions` must be
satisfied first.

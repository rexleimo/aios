---
name: pre-edit-safety-gate
description: Use before ANY code modification — editing files, creating new files, or changing behavior. Mandatory CRG impact-radius check, dependency tracing, style alignment, and test-coverage verification before edits. Post-edit CRG update and verification.

installCatalogName: pre-edit-safety-gate
clients: [codex, claude, gemini, opencode]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, safety, edit, verification, essential]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush, agents]
---

# Pre-Edit Safety Gate

**This skill gates ALL code modifications. It is NOT optional. Skip it and your edits are invalid.**

## Trigger

Invoke this skill BEFORE any of these actions:
- Editing an existing file (`edit` tool)
- Creating a new file (`write` tool)
- Deleting or renaming code

Do NOT skip for "simple changes", "one-liners", or "obvious fixes". Small edits cause regressions too.

## Pre-Edit Checklist (MUST complete all 5 before touching code)

| # | Check | Command | Block rule |
|---|-------|---------|------------|
| 1 | **Project context** | `get_minimal_context(task="brief description")` | Required |
| 2 | **Blast radius** | `get_impact_radius(detail_level="minimal")` | **risk=high → STOP**, re-evaluate approach |
| 3 | **Dependencies** | `query_graph(pattern="callees_of|callers_of|importers_of", target="<symbol>")` | Required |
| 4 | **Style alignment** | Read target file + 2 neighboring files. Extract: indent width, naming style, import ordering, error-handling patterns | Required |
| 5 | **Test coverage** | `query_graph(pattern="tests_for", target="<symbol>")` | **No tests → write tests FIRST**, then edit code |

## Post-Edit Checklist (MUST complete all 4 after every edit)

| # | Check | Command | Block rule |
|---|-------|---------|------------|
| 1 | **Update graph** | `build_or_update_graph_tool()` | **MANDATORY after every single edit** |
| 2 | **Verify impact** | `detect_changes(detail_level="minimal")` | Required |
| 3 | **Typecheck** | Project typecheck command (e.g. `npm run typecheck`) | Fix errors before proceeding |
| 4 | **Run tests** | Project test command (e.g. `npm run test`) | Fix failures before proceeding |

## Modification Plan Approval

For changes involving **2+ files or core logic**, output a plan BEFORE coding:

1. Files to modify (from graph analysis)
2. Potential regression risks
3. Test steps for verification

→ **Wait for user approval** before editing.

## Code Reuse Rules

- Search existing implementations with `semantic_search_nodes` before writing new code
- Do NOT append substantial code to files exceeding 500 lines — extract a new module instead
- Use project infrastructure, not ad-hoc replacements (see project AGENTS.md for specifics)

## Test Discipline

- Run tests after every code change
- Write robust business logic — NEVER hardcode to pass a specific test case
- Missing test coverage on modified symbols → write tests first

## UI/Style Additional Checks

When modifying CSS, styles, shared components, or theme variables:
- Run `query_graph(pattern="importers_of", target="<file>")` to list all dependents
- Run `get_affected_flows()` to trace impact on all referencing pages
- Confirm each dependent is not broken before claiming completion

## Red Flags — STOP and Re-check

| You think | Reality |
|-----------|---------|
| "This is just a one-line fix" | One-liners cause regressions. Check blast radius. |
| "I already know the codebase" | Code changes. Graph is authoritative. Run the checks. |
| "I'll update the graph later" | Stale graph poisons future sessions. Update NOW. |
| "No tests exist for this area" | Write tests FIRST, then modify. |
| "The style is obvious" | Read neighboring files. Every codebase has its own conventions. |
| "Tests can wait until I'm done" | Tests AFTER edits prove nothing about intent. Tests FIRST define expected behavior. |

## Failure Protocol

If ANY pre-edit or post-edit check fails → report the failure to user, do NOT proceed with changes until resolved.

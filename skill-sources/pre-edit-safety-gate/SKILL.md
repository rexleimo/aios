---
name: pre-edit-safety-gate
description: Use before ANY code modification — editing files, creating new files, or changing behavior. Mandatory CRG impact-radius check, dependency tracing, style alignment, and test-coverage verification before edits. Post-edit CRG update and verification.

installCatalogName: pre-edit-safety-gate
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, safety, edit, verification, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Pre-Edit Safety Gate

**This skill gates ALL code modifications. It is NOT optional. Skip it and your edits are invalid.**

## Trigger

Invoke this skill BEFORE any of these actions:
- Editing an existing file (`edit` tool)
- Creating a new file (`write` tool)
- Deleting or renaming code

Do NOT skip for "simple changes", "one-liners", or "obvious fixes". Small edits cause regressions too.

## Tier Selection

| 变更类型 | 模式 | 跳过项 |
|---------|------|--------|
| 纯文档/注释/格式 | **Lightweight** | Blast radius, Dependencies, Test coverage |
| 逻辑/行为变更 | **Full** | 无（走完整流程） |

不确定时默认走 Full。若选择 Lightweight 但被 CRG 检测到风险，自动升级为 Full。

## Pre-Edit Checklist (MUST complete all 5 before touching code)

| # | Check | Command | Block rule |
|---|-------|---------|------------|
| 1 | **Project context** | `get_minimal_context(task="brief description")` | Required |
| 2 | **Blast radius** | `get_impact_radius(detail_level="minimal")` | **risk=high → STOP**, re-evaluate approach |
| 3 | **Dependencies** | **根据场景选其一**：`callees_of`（看被调方）、`callers_of`（看调用方）、`importers_of`（看引用方）。target 填函数名或类名 | Required |
| 4 | **Style alignment** | Read target file + 2 neighboring files. Extract: indent width, naming style, import ordering, error-handling patterns | Required |
| 5 | **Test coverage** | `query_graph(pattern="tests_for", target="<函数名或类名>")` | **No tests → write tests FIRST**, then edit code |

## Post-Edit Checklist (MUST complete all 4 after every edit)

| # | Check | Command | Block rule |
|---|-------|---------|------------|
| 1 | **Update graph** | `build_or_update_graph_tool()` | Required — 连续修改多个文件时在所有编辑完成后统一更新一次即可 |
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

## Logic Degradation Prevention

- **禁止盲目统一分支**：如果存在 `if/switch` 语句，它区分的是不同的业务逻辑。将所有分支修改为返回相同值会破坏架构语义。
- **"编译通过" ≠ "正确"**：目标是保持软件工程意图，而非仅仅让编译器满意。
- 如果修改使某个条件分支变为多余，必须：
  1. 恢复分支间的语义差异。
  2. 或提议删除整个条件结构（附说明理由）。

## Fallback Protocol

当 CRG MCP 工具不可用时，使用以下回退方案：

| 不可用工具 | 回退方案 |
|-----------|---------|
| `get_minimal_context` | 读 `.aios/context-db/index.json` + 项目 `AGENTS.md` |
| `get_impact_radius` | 用 `rg` / `grep` 手动搜索被修改符号的引用 |
| `query_graph` | 用 `rg` / `grep` 搜索调用方/引用方 |
| `detect_changes` | 用 `git diff` 确认变更范围 |
| `build_or_update_graph` | 跳过，后续工具可用时补更新 |

回退模式下仍不能跳过的检查：**Style alignment、Typecheck、Run tests**。

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

## Unsafe Operation Detection

Before proceeding with an edit, scan the change for these patterns:

| Pattern | Risk | Action |
|---------|------|--------|
| `rm -rf`, `force delete` | Data loss | **STOP** — confirm with user |
| `git push --force`, `git push -f` | History rewrite | **STOP** — confirm with user |
| `DROP TABLE`, `TRUNCATE` | Data loss | **STOP** — confirm with user |
| Production config edit | Outage risk | **STOP** — confirm with user |
| `chmod 777`, `chown` | Security | **STOP** — confirm with user |

If the edit matches any pattern, do NOT proceed until the user explicitly confirms. Report the detected pattern and wait.

<!-- SLOW_UPDATE_START -->
## Epoch 2 Strategic Guidance

- **Unsafe Operation Detection added (Step 1, manually merged)**: New section detects dangerous patterns (rm -rf, force push, DROP TABLE, chmod 777) and blocks with STOP. Closes safety gap where destructive operations could bypass the gate. Gate initially rejected due to task set gap (T9 not in validation set); edit was correct → manually merged.
- **Stable T1-T8**: All 8 original tasks pass at hard=1 — no regression across Epochs 1-2.
- **Epoch 1 guidance preserved**: Batch graph updates, tier selection, fallback protocol remain validated.
<!-- SLOW_UPDATE_END -->

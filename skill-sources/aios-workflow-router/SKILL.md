---
name: aios-workflow-router
description: "Route tasks to appropriate superpowers workflows. TRIGGER: 分析、设计、实现、调试、并发、并行、agent team、长任务、harness、plan、计划、brainstorm、头脑风暴、debug、调试、multi-step、多步骤"

installCatalogName: aios-workflow-router
clients: [codex, claude, gemini, opencode]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, workflow, routing, essential]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush, agents]
---

# AIOS Workflow Router

**This skill is a routing layer ONLY — it classifies tasks and dispatches to the correct superpowers skill. It MUST NOT implement any workflow logic itself.**

## Quick Decision Tree

```
用户请求 → 任务类型判断 → MUST invoke 对应的 superpowers skill
```

## Routing Rules

**This router is a dispatcher, not a replacement.** AIOS always has superpowers installed. Every route below MUST invoke the target skill via the Skill tool — never inline the process.

### 0. Mandatory Pre-Edit Safety Gate (ALL task types)

**BEFORE any code modification** (editing, creating, deleting files), regardless of task type, MUST invoke: `pre-edit-safety-gate`

This gate checks CRG impact radius, dependencies, style alignment, and test coverage before edits, and enforces CRG graph update + detect_changes + typecheck + test after edits. It applies to ALL task types below. Do not skip.

### 1. Design/Creative Tasks (设计/创意任务)
**Keywords**: 设计、创意、新功能、新特性、build、create、implement、brainstorm、头脑风暴

**MUST invoke**: `superpowers:brainstorming`

This skill does NOT contain any brainstorming logic. The full process (Visual Companion, spec self-review, user approval gates) lives exclusively in `superpowers:brainstorming`.

### 2. Debug/Failure Tasks (调试/故障任务)
**Keywords**: 调试、bug、错误、失败、error、fail、debug、修复、fix、不工作、broken

**MUST invoke**: `superpowers:systematic-debugging`

For AIOS-specific debugging with MCP tooling, also consider `debug-hub` or `debug` skills.

### 3. Multi-step/Long-running Tasks (多步骤/长任务)
**Keywords**: 长任务、多步骤、harness、checkpoint、evidence、long-running、multi-step、复杂任务、orchestrat

**MUST invoke**: `aios-long-running-harness`

### 4. Parallel/Agent Team Tasks (并行/团队任务)
**Keywords**: 并发、并行、agent team、团队、多agent、多个独立、dispatch、parallel、concurrent

**MUST invoke**: `superpowers:dispatching-parallel-agents`

If no subagent tool available, emulate with explicit task queues. Emit heartbeat progress every ~30s; if no worker completes after ~120s, fall back to sequential execution.

### 5. Implementation Tasks (实现任务)
**Keywords**: 实现、implement、开发、develop、编码、code、写代码

**MUST invoke**:
1. If no plan exists: `superpowers:brainstorming` first, then `superpowers:writing-plans`
2. If plan exists: `superpowers:test-driven-development`

### 6. Analysis Tasks (分析任务)
**Keywords**: 分析、analysis、研究、research、investigate、调查、为什么、why

**Route to**: Direct execution (no superpowers skill required)
1. Gather information from codebase, logs, history
2. Document findings
3. Present recommendations
4. Default to single-agent execution; do not dispatch explorer/parallel agents unless the user explicitly asks for delegation or parallel work

## Workflow Execution

### Standard Flow

```
1. Route → 2. Invoke Skill → 3. Follow Skill → 4. Verify → 5. Complete
```

### Model Selection

After routing, if the task involves model dispatch (e.g., selecting between models for cost/capability), invoke `model-router` skill for model selection. This router handles workflow routing only.

## Completion Gate

**MUST invoke**: `superpowers:verification-before-completion` before claiming any task complete.

## Resource Links

- `scripts/lib/specs/` - Runtime and safety specifications
- `docs/plans/` - Implementation plans
- `.aios/context-db/` - Runtime operation records

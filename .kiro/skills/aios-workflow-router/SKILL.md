---
name: aios-workflow-router
description: "Route tasks to appropriate workflows. TRIGGER: 分析、设计、实现、调试、并发、并行、agent team、长任务、harness、plan、计划、brainstorm、头脑风暴、debug、调试、multi-step、多步骤"
---

# AIOS Workflow Router

**This skill routes your task to the appropriate workflow. Invoke this BEFORE any other action.**

## Quick Decision Tree

```
用户请求 → 任务类型判断 → 调用相应技能/流程
```

## Task Type Detection

### 1. Design/Creative Tasks (设计/创意任务)
**Keywords**: 设计、创意、新功能、新特性、build、create、implement、设计、创意、brainstorm、头脑风暴

**Route to**: Planning workflow
1. Use `superpowers:brainstorming` if available, otherwise follow the brainstorming process below
2. Create design doc in `docs/plans/` or `docs/superpowers/specs/`
3. Get user approval before implementation

### 2. Debug/Failure Tasks (调试/故障任务)
**Keywords**: 调试、bug、错误、失败、error、fail、debug、修复、fix、不工作、broken

**Route to**: Debugging workflow
1. Use `superpowers:systematic-debugging` if available
2. Gather evidence first (logs, error messages, screenshots)
3. Form hypothesis, test, iterate

### 3. Multi-step/Long-running Tasks (多步骤/长任务)
**Keywords**: 长任务、多步骤、harness、checkpoint、evidence、long-running、multi-step、复杂任务、orchestrat

**Route to**: Harness workflow
1. Use `aios-long-running-harness` skill
2. Set preflight budgets and stop conditions
3. Create checkpoints with evidence

### 4. Parallel/Agent Team Tasks (并行/团队任务)
**Keywords**: 并发、并行、agent team、团队、多agent、多个独立、dispatch、parallel、concurrent

**Route to**: Parallel dispatch workflow
1. Identify independent problem domains
2. Confirm there are at least 2 truly independent domains before dispatching
3. Use `superpowers:dispatching-parallel-agents` if available
4. If no subagent tool available, emulate with explicit task queues
5. While waiting, emit heartbeat progress every ~30s; if no worker completes after ~120s, stop waiting and fall back to sequential execution

### 5. Implementation Tasks (实现任务)
**Keywords**: 实现、implement、开发、develop、编码、code、写代码

**Route to**: Implementation workflow
1. Check if plan exists in `docs/plans/`
2. If no plan, go through brainstorming first
3. Use `superpowers:test-driven-development` if available
4. Implement with evidence checkpoints

### 6. Analysis Tasks (分析任务)
**Keywords**: 分析、analysis、研究、research、investigate、调查、为什么、why

**Route to**: Analysis workflow
1. Gather information from codebase, logs, history
2. Document findings
3. Present recommendations
4. Default to single-agent execution; do not dispatch explorer/parallel agents unless the user explicitly asks for delegation or parallel work

## Workflow Execution

### Standard Flow

```
1. Route → 2. Plan → 3. Execute → 4. Verify → 5. Complete
```

### Mandatory Steps

1. **Route**: Identify task type (this skill)
2. **Plan**: Create or reference plan document
3. **Execute**: Follow plan with checkpoints
4. **Verify**: Assert completion with evidence
5. **Complete**: Update docs and commit

## Fallback Behaviors

If `superpowers:*` skills are not available (plugin not installed):

- **brainstorming**: Use the built-in brainstorming process in this skill
- **systematic-debugging**: Use the debugging process below
- **dispatching-parallel-agents**: Execute sequentially or emulate with task queues
- **verification-before-completion**: Manually verify artifacts exist

## Built-in Brainstorming Process

When `superpowers:brainstorming` is not available:

1. **Explore context** - Check files, docs, recent commits
2. **Ask clarifying questions** - One at a time, understand purpose
3. **Propose approaches** - 2-3 options with trade-offs
4. **Present design** - Get user approval
5. **Write plan** - Save to `docs/plans/YYYY-MM-DD-<topic>.md`

## Built-in Debugging Process

When `superpowers:systematic-debugging` is not available:

1. **Gather evidence** - Logs, errors, screenshots
2. **Form hypothesis** - Based on evidence
3. **Test hypothesis** - Make minimal change
4. **Verify fix** - Confirm with evidence
5. **Document** - Update runbook if needed

## Completion Gate

Before claiming any task complete:

- [ ] Target action succeeded
- [ ] Expected artifacts exist
- [ ] Evidence documented
- [ ] No regressions introduced

## Resource Links

- `memory/specs/行为规范.json` - Safety specifications
- `memory/specs/风险检测.json` - Risk detection rules
- `docs/plans/` - Implementation plans
- `memory/history/` - Operation records

---
title: 多 Agent 实战
description: 什么时候使用 Agent Team，怎么启动、监控、收尾，以及什么时候不要用。
---

# 多 Agent 实战

**One agent is good. Multiple agents working together can be great — but only when the task actually calls for it.**

Agent Team lets you split a task across multiple coding agents working in parallel. Each agent handles part of the work, and you can monitor their progress in real time.

## The One Command To Remember

```bash
# Start 3 agents on a task
aios team 3:codex "Build the settings page, add tests, and update docs"

# Watch them work
aios team status --provider codex --watch
```

## When To Use Teams (And When Not To)

### Good fit for Agent Team

适合用：

- 一个需求能拆成前端、后端、测试、文档等相对独立部分。
- 你已经知道验收标准，比如"测试必须通过""文档要更新"。
- 你愿意为并行执行支付更多 token 和等待成本。
- 你需要 HUD/历史记录来追踪多个 worker。

### Bad fit for Agent Team

不适合用：

- 需求还没想清楚，只是在探索方向。
- 小 bug、单文件修复、一次性命令。
- 多个 worker 大概率会改同一个文件。
- 你正在调试一个需要稳定复现的问题。

不确定时，先用普通交互式：

```bash
codex
```

### Quick Checklist

开 team 前建议先确认这 3 项：

<div class="rex-checklist">
  <div class="rex-checklist__item">能拆成 2 个以上独立模块</div>
  <div class="rex-checklist__item">多个 worker 不会改同一批文件</div>
  <div class="rex-checklist__item">验收标准能一句话说清</div>
</div>

## The 10-Minute Flow

### 1. Write A Clear Task
### 2. Start Monitoring
### 3. Check History And Failures
### 4. Run A Quality Check Before Finishing

```bash
aios quality-gate pre-pr --profile strict
```

如果 quality gate 失败，先看失败分类，不要直接再次开更多 worker。

## How Many Agents Should I Use?

| Count | Command | Best for |
|---|---|---|
| 2 | `aios team 2:codex "task"` | First time, or when files might overlap |
| 3 | `aios team 3:codex "task"` | Most daily features (recommended) |
| 4 | `aios team 4:codex "task"` | Very independent modules with clear tests |

If you see conflicts or duplicate edits, reduce the count — don't increase it.

## Choosing A Provider

```bash
aios team 3:codex "task"
aios team 2:claude "task"
aios team 2:gemini "task" --dry-run
```

Recommendations:

- Use `codex` for daily implementation work.
- Try `claude` for long-form analysis or planning comparisons.
- Use `--dry-run` when you're not sure what will happen.

## If Something Goes Wrong

### A run was interrupted

如果某次运行中断，先看历史：

```bash
aios team history --provider codex --limit 5
```

然后只重试 blocked job：

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

不要在不了解失败原因时直接重新开一个更大的 team。

## How Team Works Under The Hood

当 `aios team` 在 live 模式下运行时，它使用 **GroupChat Runtime**：一种基于轮次的执行模型，agent 共享同一个对话线程，而非在隔离的单次 dispatch 中工作。

```
Round 1 → Planner analyzes the task and creates work items
Round 2 → N implementers work in parallel (one per work item)
Round 3 → Reviewer checks the results
```

If an agent gets stuck, the planner **automatically re-plans** the next round.

### Blueprints

| Blueprint | Rounds | Best for |
|---|---|---|
| `bugfix` | plan → implement → review | Simple fixes, small scope |
| `feature` | plan → implement → review + security | New features with quality checks |
| `refactor` | plan → implement → review | Pure refactoring, no new features |
| `security` | assess → plan → implement → review | Security-sensitive changes |

Use the smallest blueprint that fits your task.

Blueprints, role cards, runtime manifests, executor manifests, and handoff schemas are packaged under `scripts/lib/specs/`. Team run state and evidence are still written to `.aios/context-db/`; `memory/memo/` is only for project memo records and is not the team runtime store.

### Configuration

```bash
# Required for live execution
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli   # or claude-code, gemini-cli, opencode-cli

# Concurrency (speakers per round)
export AIOS_SUBAGENT_CONCURRENCY=3      # default: 3

# Per-agent turn timeout (milliseconds)
export AIOS_SUBAGENT_TIMEOUT_MS=600000  # default: 10 minutes

# Skip capability preflight and go straight to live (use with caution)
export AIOS_ALLOW_UNKNOWN_CAPABILITIES=1
```

GroupChat live execution is gated by `AIOS_EXECUTE_LIVE=1`. When not set, `aios team` falls back to a dry-run preview of the dispatch plan.

## Team vs. Harness vs. Orchestrate

| 能力 | 更适合 |
|---|---|
| `aios team ...` | 想快速开多个 worker 做一个任务 |
| `aios orchestrate ... --execute dry-run` | 想先看阶段 DAG 和门禁 |
| `aios orchestrate ... --execute live` | 维护者需要严格分阶段执行 |

新用户优先用 `team`。`orchestrate live` 需要显式 opt-in：

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli
aios orchestrate --session <session-id> --dispatch local --execute live
```

## Command Reference

```bash
# 启动团队（默认 dry-run 预览）
aios team 3:codex "Ship X"

# 启动团队（live GroupChat 执行）
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli aios team 3:codex "Ship X"

# 监控当前状态
aios team status --provider codex --watch

# 最近历史
aios team history --provider codex --limit 20

# 只看失败
aios team history --provider codex --quality-failed-only

# 当前会话 HUD
aios hud --provider codex

# 重试 blocked jobs
aios team --resume <session-id> --retry-blocked --provider codex --workers 2

# 使用 GroupChat runtime 编排（完整轮次执行）
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "修复 X" --execute live --preflight none
```

## Advanced Operations Reference

以下命令建议在熟悉基础流程后再使用。

### HUD Presets

| Preset | 用途 |
|---|---|
| `minimal` | 长时间 watch |
| `compact` | 终端友好摘要 |
| `focused` | 均衡默认 |
| `full` | 完整诊断 |

```bash
aios hud --provider codex
aios hud --watch --preset focused
aios hud --session <session-id> --json
```

### Skill Candidates

Skill candidates 是从失败会话中提取的改进建议。失败复盘时再看，不是新手第一步。

```bash
aios team status --show-skill-candidates
aios team skill-candidates list --session <session-id>
aios team skill-candidates export --session <session-id> --output ./candidate.patch.md
```

应用前必须人工审查补丁，尤其是会改 skills、hooks、MCP 配置的建议。

## Where To Go Next

- [按场景找命令](use-cases.md)
- [HUD 指南](hud-guide.md)
- [Skill Candidates](skill-candidates.md)
- [路由与并发档位](route-concurrency-profiles.md)
- [故障排查](troubleshooting.md)

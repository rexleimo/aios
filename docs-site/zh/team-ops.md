---
title: 多 Agent 实战
description: 什么时候使用 Agent Team，怎么启动、监控、收尾，以及什么时候不要用。
---

# 多 Agent 实战

**一个 agent 很好。多个 agent 协同工作可以更出色 — 但只有当任务确实需要时。**

Agent Team 让你可以将一个任务分散到多个编码 agent 并行工作。每个 agent 处理部分工作，你可以实时监控他们的进度。

## 记住这一个命令

```bash
# 启动 3 个 agent 执行任务
aios team 3:codex "构建设置页面，添加测试，并更新文档"

# 观察他们工作
aios team status --provider codex --watch
```

## 何时使用团队（以及何时不使用）

### 适合 Agent Team

适合用：

- 一个需求能拆成前端、后端、测试、文档等相对独立部分。
- 你已经知道验收标准，比如"测试必须通过""文档要更新"。
- 你愿意为并行执行支付更多 token 和等待成本。
- 你需要 HUD/历史记录来追踪多个 worker。

### 不适合 Agent Team

不适合用：

- 需求还没想清楚，只是在探索方向。
- 小 bug、单文件修复、一次性命令。
- 多个 worker 大概率会改同一个文件。
- 你正在调试一个需要稳定复现的问题。

不确定时，先用普通交互式：

```bash
codex
```

### 快速检查清单

开 team 前建议先确认这 3 项：

<div class="rex-checklist">
  <div class="rex-checklist__item">能拆成 2 个以上独立模块</div>
  <div class="rex-checklist__item">多个 worker 不会改同一批文件</div>
  <div class="rex-checklist__item">验收标准能一句话说清</div>
</div>

## 10 分钟流程

### 1. 写一个清晰的任务
### 2. 开始监控
### 3. 检查历史和失败
### 4. 完成前运行质量检查

```bash
aios quality-gate pre-pr --profile strict
```

如果 quality gate 失败，先看失败分类，不要直接再次开更多 worker。

## 我应该使用多少个 Agent？

| 数量 | 命令 | 最适合 |
|---|---|---|
| 2 | `aios team 2:codex "task"` | 第一次，或者文件可能重叠时 |
| 3 | `aios team 3:codex "task"` | 大多数日常功能（推荐） |
| 4 | `aios team 4:codex "task"` | 有清晰测试的非常独立模块 |

如果你看到冲突或重复编辑，减少数量 — 而不是增加。

## 选择 Provider

```bash
aios team 3:codex "task"
aios team 2:claude "task"
aios team 2:gemini "task" --dry-run
```

建议：

- 使用 `codex` 进行日常实现工作。
- 尝试 `claude` 进行长篇分析或规划比较。
- 当你不确定会发生什么时使用 `--dry-run`。

## 如果出了问题

### 运行被中断

如果某次运行中断，先看历史：

```bash
aios team history --provider codex --limit 5
```

然后只重试 blocked job：

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

不要在不了解失败原因时直接重新开一个更大的 team。

## Team 幕后工作原理

当 `aios team` 在 live 模式下运行时，它使用 **GroupChat Runtime**：一种基于轮次的执行模型，agent 共享同一个对话线程，而非在隔离的单次 dispatch 中工作。

```
第 1 轮 → Planner 分析任务并创建工作项
第 2 轮 → N 个实现者并行工作（每个工作项一个）
第 3 轮 → Reviewer 检查结果
```

如果一个 agent 卡住了，planner **自动重新规划**下一轮。

### 蓝图

| 蓝图 | 轮次 | 最适合 |
|---|---|---|
| `bugfix` | plan → implement → review | 简单修复，小范围 |
| `feature` | plan → implement → review + security | 有质量检查的新功能 |
| `refactor` | plan → implement → review | 纯重构，无新功能 |
| `security` | assess → plan → implement → review | 安全敏感变更 |

使用适合你任务的最小蓝图。

蓝图、角色卡片、运行时清单、执行器清单和交接模式打包在 `scripts/lib/specs/` 下。Team 运行状态和证据仍然写入 `.aios/context-db/`；`.aios/memo/` 仅用于项目备忘录记录，不是 team 运行时存储。

## Agent 治理与 smoke 证据

随着 agent 面越来越大，要把每次工作流改动都当成一次契约变更。把团队或 harness 的 live 跑法放出去之前，先用 smoke 证据和训练检查证明新行为仍然符合系统契约。

```bash
# 先预览 agent smoke 路径，不做 live 执行
node scripts/aios.mjs agents smoke --dry-run --json

# 为当前 agent 集合记录 smoke 证据
node scripts/aios.mjs agents smoke --json

# 确认已修改的 skill 在 live 使用前完成训练校验
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

smoke 运行会为每个核心风险 agent 写入三类证据：

- `.aios/agents/smoke/<agent>.json`
- `.aios/agents/provenance/<agent>.json`
- `.aios/interception/metrics/agents-smoke-<agent>.jsonl`

把这些证据当成是否可以进入 live workflow 的依据。只要 skill 有改动，training verification 就是 done 的一部分。

### 配置

```bash
# live 执行必须
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli   # 或 claude-code, gemini-cli, opencode-cli

# 并发（每轮发言者数量）
export AIOS_SUBAGENT_CONCURRENCY=3      # 默认：3

# 每个 agent 轮次超时（毫秒）
export AIOS_SUBAGENT_TIMEOUT_MS=600000  # 默认：10 分钟

# 跳过 capability preflight 直接进入 live（谨慎使用）
export AIOS_ALLOW_UNKNOWN_CAPABILITIES=1
```

GroupChat live 执行由 `AIOS_EXECUTE_LIVE=1` 门控。如果未设置，`aios team` 回退到调度计划的 dry-run 预览。

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

## 命令参考

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

## 高级操作参考

以下命令建议在熟悉基础流程后再使用。

### HUD 预设

| 预设 | 用途 |
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

## 下一步去哪里

- [按场景找命令](use-cases.md)
- [HUD 指南](hud-guide.md)
- [技能候选](skill-candidates.md)
- [路由与并发档位](route-concurrency-profiles.md)
- [故障排查](troubleshooting.md)

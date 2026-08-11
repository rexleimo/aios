---
title: "v5.6.0：一条命令并行多 Agent 编码 — aios work"
description: "v5.6.0 新增 aios work：一条命令把任意任务变成规划好的并发多 Agent 调度——规划、实现、审查、安全检查并行执行并经过 merge gate 收口，不再单 Agent 串行等待。"
date: 2026-08-11
tags: ["AIOS", "multi-agent", "parallel", "orchestration", "release", "v5.6.0"]
---

# v5.6.0：一条命令并行多 Agent 编码 — `aios work`

## 问题

单个编码 Agent 是串行工作的：规划、改代码、审查、重复。每一步都在等同一个进程，所以一个包含三个独立部分的任务要花三倍于一部分的时间。AIOS 里其实一直有并行多 Agent 编排（`aios orchestrate`），但它是 opt-in、被环境变量 gate 挡住、还要记好几个参数——所以大多数日常活仍然跑在单个 Agent 上。

## 快速回答

**`aios work` 是一条命令：把任务描述变成一次并发多 Agent 调度。** 它先规划任务、拆成独立工作项，让 planner、implementer、reviewer、security-reviewer 并行执行（默认并发度 3），再通过安全 merge gate 收口——全程一次 CLI 调用。live 执行默认开启；`--dry-run` 预览计划，`--serial` 强制安全串行。它包装的是已有编排引擎，没有新组件：证据、所有权、merge-gate 守卫全部沿用。

## 操作步骤

1. 升级 AIOS 到 v5.6.0（`aios update`）。
2. 一条命令跑任意任务：

```bash
aios work --task "Ship the release checklist"
```

3. 提交 live 前先预览：

```bash
aios work --task "Ship the release checklist" --dry-run --json
```

4. 耦合任务强制串行：

```bash
aios work --task "Refactor the auth module" --serial
```

5. 调并发度和客户端：

```bash
aios work --task "Review auth, update tests, write docs" --client codex-cli --concurrency 4
```

## 调度如何工作

- **自动分解。** 任务标题和 `--context` 提示被拆成带路径归属提示（`docs/`、`scripts/tests/`、`mcp-server/src/`）的工作项。
- **DAG 执行。** plan 与 implement 阶段串行；review 与 security-review 并行；merge gate 校验 handoff、文件所有权、只读审查规则后才合并。
- **有界并行。** `aios work` 默认 3 个并发 subagent（`--concurrency N` 调整，`--serial` 降到 1）。
- **安全门不降级。** preflight readiness、capability manifest、owned path prefixes、file policy、merge gate 全部生效。未知能力面的 live 执行会被拒绝，除非用 `--force` 明确接受——与既有 `aios team` / `aios orchestrate --execute live` 路径完全一致。
- **按阶段模型路由。** planner、implementer、reviewer、security-reviewer 默认各自通过 model router 解析模型。

## 示例

```bash
# 默认：live 并发调度（并发度 3，merge-gate 收口）
aios work --task "Refactor mcp-server and add tests"

# 零成本预览（不唤起模型客户端）
aios work --task "Ship the release checklist" --dry-run --json

# 多工作项分解提示（分号 / 换行分隔）
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# 关联 session 续跑 / 重放 blocked
aios work --task "Ship the release checklist" --session codex-cli-20260811T... --retry-blocked
```

## 为什么不直接用 `aios team` 或 `aios orchestrate`？

它们仍然存在且行为不变。`aios work` 是同一个引擎配上了**日常使用默认值**：live 默认开、一条命令、不用记环境变量。`aios team` 仍是状态/历史/观测视图；`aios orchestrate` 仍是完全显式的控制面。

## FAQ

### `aios work` 会真的唤起模型客户端吗？

会——live 模式运行真实 one-shot subagent（codex、claude、gemini、opencode，由 `--client` / `AIOS_SUBAGENT_CLIENT` 指定）。零成本预览用 `--dry-run`，或设 `AIOS_SUBAGENT_SIMULATE=1` 走模拟管道而不调用模型。

### 并行调度对我的工作区安全吗？

与 `aios team` 相同的守卫：preflight readiness、capability manifest 检查、owned-path file policy、以及阻止并行输出文件所有权重叠的 merge gate。耦合任务随时可用 `--serial` 退回串行。

### 它会取代 rex workflow 的 Command 选择吗？

不会。`aios work` 是并行调度通道；rex workflow（同一时刻只有一条 current Command）仍负责分阶段 Provider 选择。两者正交。

### 支持哪些客户端？

`codex-cli`、`claude`、`gemini`、`opencode`——与 subagent runtime 同一套客户端集合。默认 `codex-cli`。

### 我要速度但预算有限，该用什么？

`aios work --task "..." --concurrency 2` 限制 live 并行度，`--dry-run` 先预览 DAG 与工作项，`aios learn-eval` 把上次调度的证据变成下一次建议。

## 相关阅读

- [Orchestrate Live: 生产环境运行 Subagents](orchestrate-live.md)
- [并行编码 Agent 不是免费的：Git Worktree 隔离文件、不隔离状态](2026-08-parallel-coding-agents.md)
- [Agent Governance: Team 运行先自证再 live](2026-06-agent-governance.md)
- 文档：[Team Ops](https://cli.rexai.top/zh/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/zh/route-concurrency-profiles/)

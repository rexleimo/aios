---
title: "v5.6.1：计划驱动的多 Agent 调度 —— aios work 读取你的计划"
description: "v5.6.1 让 aios work 变成计划驱动：活动结构化计划中的合格任务直接变成并行工作项，带依赖、路径归属和验收标准——不再隐性分解。"
date: 2026-08-12
tags: ["AIOS", "multi-agent", "parallel", "dispatch", "planning", "release", "v5.6.1"]
---

# v5.6.1：计划驱动的多 Agent 调度 —— `aios work` 读取你的计划

## 问题

[v5.6.0](2026-08-v560-aios-work-concurrent-dispatch.md) 让 `aios work` 成为并行多 Agent 编码的一条命令入口：规划、分解、调度 planner、implementer、reviewer、security-reviewer，并用 merge gate 收口。但分解这一步仍然是隐性的——工作项是从任务标题和 `--context` 提示里猜出来的。如果你的计划存在于结构化计划文档里（带依赖、路径归属和验收标准），调度根本不会读它，而且调度后的报告可能与实际执行的工作项不一致。

## 快速回答

**v5.6.1 让 `aios work` 变成计划驱动：有结构化计划时，计划中的合格任务直接成为并行工作项。** 每个工作项保留计划里的依赖、路径归属（`targets` + `allowedWrites`）和验收标准，并行 subagent 严格按你的计划划定的边界干活。`;` 分隔的 `--context` 回退路径保留给无计划场景；新的 `aios-work-dispatch` 技能教会 agent 何时该走并行调度——计划型工作、至少两个独立项、文件归属不重叠、无严格顺序——并且在上线前有预览/批准边界。

## v5.6.1 改了什么

1. **计划任务变成工作项。** `aios work` 分解活动结构化计划：合格计划任务被提升为工作项，依赖、路径归属（`targets` + `allowedWrites`）、验收标准全部从计划保留。
2. **分号 context 仍是回退路径。** 没有活动计划？`--context "mcp-server 重构; docs 更新; 测试补充"` 照旧分解成工作项——无计划调用行为不变。
3. **报告与执行的计划一致。** 调度后报告现在保留计划驱动分解，不再重新计算工作项，你看到的顶层 `workItems` 就是实际执行的。
4. **agent 学会何时调度。** 新的规范 `aios-work-dispatch` 技能固化了进入条件（planned disposition、至少两个独立项、文件归属不重叠、无严格顺序）、如何表达分解、以及预览/批准边界。
5. **路由器把并行工作送到调度。** `aios-workflow-router` 现在把可并行的计划型工作路由进调度技能，从计划到并行执行的闭环是教出来的行为，不再是猜测。

## 计划驱动分解如何工作

- **计划是唯一事实来源。** 合格计划任务自带依赖、路径归属和验收标准——`aios work` 读取它们，而不是从自由文本重新猜。
- **归属显式。** 每个工作项的 `targets` + `allowedWrites` 让并行 subagent 待在各自车道内；merge gate 仍阻止文件归属重叠。
- **回退路径可预测。** 没有活动计划时，分解使用任务标题加 `;` 分隔的 `--context` 提示，与 v5.6.0 完全一致。
- **安全不降级。** preflight readiness、capability guard、owned-path file policy、merge gate 全部生效；`--dry-run` 零成本预览分解后的计划与工作项。

## 示例

```bash
# 计划驱动：工作项来自活动结构化计划
aios work --task "Ship the release checklist"

# 任何执行前先预览计划驱动分解
aios work --task "Ship the release checklist" --dry-run --json

# 无计划回退照常工作
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# 耦合计划任务强制串行
aios work --task "Refactor the auth module" --serial
```

## FAQ

### 怎么确认调度读了我的计划？

`aios work --task "..." --dry-run --json` 在任何执行前打印分解出的工作项、依赖和路径归属。有活动计划时，工作项来自计划。

### 这会取代我的规划流程吗？

不会。计划仍是唯一事实来源——调度只是遵守它。你的工作流用结构化计划时，`aios work` 现在执行它的边界，而不是发明新边界。

### 什么时候**不该**并行？

并行调度需要至少两个独立工作项、文件归属不重叠、项间无严格顺序。耦合变更属于单车道（`--serial`）；新的 `aios-work-dispatch` 技能固化了这些门槛，agent 不会乱猜。

### 批准边界还是人工控制吗？

是。调度技能要求 live 执行前先预览；`--dry-run` 是零成本审查计划驱动工作项的方式，live 调度保留 v5.6.0 的 readiness、capability、ownership、merge-gate 守卫。

### 升级或搬仓库后 MCP 服务器挂了怎么办？

客户端配置（如 `~/.config/opencode/opencode.json`）里的 MCP 条目存的是本仓库 `scripts/` 启动器的绝对路径。项目或安装目录移动后，路径失效导致服务器启动失败。在新项目根目录修复：

```bash
aios internal browser mcp-migrate
# 或：aios update   （browser 组件在默认更新集合里）
```

然后重启客户端。`aios doctor` 只检查启动器路径，不重写。完整说明：[故障排查](https://cli.rexai.top/zh/troubleshooting/)。

## 相关阅读

- [v5.6.0：一条命令并行多 Agent 编码 —— aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Orchestrate Live：生产环境运行 Subagent](orchestrate-live.md)
- [并行编码 Agent 不是免费的：Git Worktree 隔离文件，不隔离状态](2026-08-parallel-coding-agents.md)
- [Agent 治理：让 Team 运行在上线前证明自己](2026-06-agent-governance.md)
- 文档：[Team Ops](https://cli.rexai.top/zh/team-ops/) · [路由与并发档位](https://cli.rexai.top/zh/route-concurrency-profiles/)

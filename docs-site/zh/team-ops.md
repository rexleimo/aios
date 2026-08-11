---
title: Agent Team：带证据的并行工作
description: 选择独立工作包，启动 Agent Team，监控 HUD 状态，并安全恢复阻塞任务。
---

# Agent Team

## 一句话回答

当任务可以拆成两个或更多独立工作包，并且每个包都有明确负责人和验收证据时，使用 Agent Team。小改动或强耦合工作用一个客户端，单个长目标用 Solo Harness，分阶段质量门禁用 Orchestrate。日常可分解成独立项的任务用 `aios work`，默认 live 并行调度。dry-run 只能检查本地 dispatch 状态，不能证明实时供应商可用。

## 现在就做

先预览 dispatch：

~~~bash
aios team --provider codex --workers 3 --task "审查 auth、测试和文档" --dry-run --json
~~~

任务和实时供应商准备好后：

~~~bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "审查 auth、测试和文档"
~~~

## 选择正确路径

| 需求 | 路径 |
| --- | --- |
| 回答、检查或一个小的本地改动 | direct 或 guarded |
| 一个明确的长任务目标 | [Solo Harness](solo-harness.md) |
| 两个或更多独立工作包 | Agent Team |
| 可分解成独立项的日常任务 | `aios work`（默认 live） |
| 按顺序执行并有门禁的阶段 | aios orchestrate |
| 需求仍不明确 | 先使用交互式客户端 |

## 启动前

用一句话写清目标、边界和验收证据：

~~~text
目标：更新登录表单
边界：不修改 auth API
证据：定向测试通过，变更后的文档链接到新行为
~~~

确认 workers 不会修改同一文件。如果文件重叠，应按所有权顺序执行或只使用一个 Agent。

## 监控和审查

~~~bash
aios team status --provider codex --watch
aios hud --provider codex
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
aios quality-gate pre-pr --profile strict
~~~

合并 worker 输出前检查变更文件和质量类别。状态是运行证据，不等于代码正确性证明。

## 治理证据

新增 Agent、修改路由或更新工作流 skill 时，先运行 smoke 和 training 检查：

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

这些命令会在 .aios/agents/ 和 .aios/interception/metrics/ 下写证据。不要把敏感供应商输出放进公开 issue。

## 恢复阻塞任务

重试前先看最新 session：

~~~bash
aios team history --provider codex --limit 5
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
~~~

如果任务冲突，降低 worker 数量。只有理解即将绕过的安全门禁时才使用 --force。

## 运行时结构

普通 live team 按轮次工作：

~~~text
planner -> 独立 implementers -> reviewer
                 |
                 +-> 阻塞任务可能触发重新规划轮次
~~~

运行时支持 feature、bugfix、refactor、security blueprint。选择与任务匹配的最小 blueprint；如果 preflight 需要 plan artifact，请保留它。

## 常见问题

### Team 一定更快吗？

不一定。它会增加协调和供应商工作，只适合真正独立的工作包，不适合单文件修复。

### dry-run 会测试供应商吗？

不会。它测试本地解析和计划 dispatch。要测试供应商和客户端路由，需要运行小型 live smoke task。

### 应该使用多少 worker？

边界不确定时从两个开始；独立性清晰的日常任务可以从三个开始。更多 worker 会增加协调和冲突风险。

### 阻塞的 run 可以继续吗？

可以。先读 history，定位 blocked job，再使用 resume 和 retry-blocked。不要盲目重启整个团队。

## 下一步

- [HUD 指南](hud-guide.md) - 查看详细 session 证据。
- [工作流策略](workflow-policy.md) - 了解 planned 和 team 路由。
- [Solo Harness](solo-harness.md) - 运行单个长任务。
- [按场景找命令](use-cases.md) - 按意图比较命令。

---
title: 工作流策略
description: 了解 AIOS 如何用自适应工作流策略选择 direct、guarded 或 planned 路由。
---

# 工作流策略

## 快速答案

AIOS 使用基于风险的工作流策略。在 adaptive 模式下，只读问题保持 direct，小型代码修改进入 guarded，多步骤或明确指定路由的工作进入持久化 plan。strict 模式会让实质性工作进入 planned，但不会把空消息或只读问题变成 plan。策略只决定当前 turn 应如何处理，并不证明实现已经完成。

## 现在就做

在项目根目录预览或应用策略：

```bash
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --json
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --dry-run --json
```

第一条命令在 decision 为 `planned` 时可能创建 plan。第二条命令只评估同一个请求，不持久化 planned artifact。如果项目根目录不是当前目录，可以使用 `--workspace <path>`。

## 四种 disposition

| Disposition | 适用场景 | Persistence | Verification scope |
| --- | --- | --- | --- |
| `noop` | 空输入或明确的 no-op | `none` | `none` |
| `direct` | 问题、解释、状态检查、确认或 resume 决策 | `none` 或 `reuse` | `none` |
| `guarded` | adaptive 模式下的小型实质性修改 | `none` | `focused` |
| `planned` | 多步骤、明确计划、Team/Harness、设计工作或 strict 实质性工作 | `create` | `full` |

`direct` 不等于跳过所有安全措施。如果 direct 请求后来变成文件修改，仍然必须执行正常的编辑和验证门禁。`guarded` 只表示策略没有要求持久化 plan；修改文件前仍需执行 `pre-edit-safety-gate`，之后进行 focused verification。

## Adaptive 与 Strict

Adaptive 是默认模式。像“修改这个 label 并运行 focused test”这样的小型实现请求通常保持 `guarded`；包含多个步骤、迁移、team 路由或 harness 路由的请求会进入 `planned`。Strict 会让实质性工作进入 `planned`，以便在实现前记录 owner、tasks 和 evidence。两种模式都会让只读问题、空输入以及没有 active plan 的 resume 请求保持 direct。

策略是分类器，不是对“小修改”的万能定义。最终 decision 会包含 `reason`、`routeHint`、`requiredSkills`、`requiresPreEditSafety` 和 `verificationScope`；边界不清时请查看 JSON。

## Plan 持久化

Adapter 会返回三种 persistence 指令之一：

- `none`：不要创建或更新 plan artifact。`noop`、普通 direct 问题和 adaptive guarded 修改都会得到它。
- `reuse`：使用已有的非 terminal active plan。有效的同会话确认或显式 resume 会使用它。
- `create`：按照选定 route 和 required skills 创建新的 work-item plan。Dry run 只返回 decision，不写入它。

`done`、`blocked`、`cancelled`、`completed`、`failed` 和 `abandoned` 等 terminal status 不能继续。Plan decision 不是实现结果：关闭 plan 前仍需更新 task、记录 evidence、执行编辑门禁和完成验证。

## Continuation 规则

有两条刻意不同的继续路径：

1. **同会话 acknowledgement。** `ok` 或 `approved` 这样的简短确认，只有在 client 和 session identity 都与 plan 匹配且 plan 非 terminal 时，才能复用 plan。来自其他 client 或 session 的确认会被视为 continuation 缺失的 direct 请求。
2. **显式 resume。** `resume` 或 `continue` 可以跨 client 复用非 terminal plan。如果没有可用 active plan，结果是 `direct` 且 `continuation=missing`，不会意外创建 plan。

如果 acknowledgement 或 resume 后面还包含新的 actionable objective，它会被当作新工作重新分类，不会静默挂到旧 plan 上。

## Route Hints 与 Skills

Decision 可以建议 route 和最小 process skill 集合：

| Route hint | 典型触发 | Planned skills |
| --- | --- | --- |
| `implement` | 功能或文件修改 | `writing-plans`、`test-driven-development` |
| `debug` | Bug、失败或崩溃 | `systematic-debugging` |
| `verify` | Test、typecheck、CI 或回归验证 | `verification-before-completion` |
| `ops` | 安装、配置、升级、部署或发布 | `writing-plans` |
| `team` | 并行或委派工作 | `writing-plans`、`dispatching-parallel-agents` |
| `harness` | 长任务或过夜任务 | `writing-plans`、`aios-long-running-harness` |
| `design` | 架构、设计或 brainstorming | `brainstorming`、`writing-plans` |

策略不会替代选中的 skill，也不会替代 `pre-edit-safety-gate`。后者会在任何文件修改前检查影响范围、依赖、风格和测试覆盖。

## 示例

### 只读问题

```bash
node scripts/aios.mjs plan auto-gate --task "Why is this request classified as direct?" --json
```

预期是 `disposition=direct`、`persistence=none`，并且不会创建新的 plan artifact。

### Adaptive 下的小型实现

```bash
node scripts/aios.mjs plan auto-gate --task "Update the button label and run its focused test" --json
```

这通常是 `guarded`，使用 focused verification 且不持久化 plan。如果请求扩展到多个文件或多个阶段，请重新分类扩展后的请求。

### 多步骤实现

```bash
node scripts/aios.mjs plan auto-gate --task "First update the schema, then migrate callers, and finally add regression tests" --json
```

预期是 `planned`、`persistence=create`、full verification scope 和实现相关 skills。

### Team 任务

```bash
node scripts/aios.mjs plan auto-gate --task "Use an Agent Team to audit the API and docs in parallel" --json
```

Route hint 是 `team`。策略 decision 不会自行启动 provider；完成 plan 和安全门禁后，再使用 Agent Team 的 preflight 与执行控制。

### 显式 resume

```bash
node scripts/aios.mjs plan auto-gate --task "resume" --json
```

存在可用 active plan 时，预期是 `continuation=explicit-resume` 和 `persistence=reuse`。没有 active plan 时，预期是 direct 的 continuation 缺失结果，并且不会创建新的 plan。

## FAQ

### 每条消息都会创建 plan 吗？

不会。空输入是 `noop`；问题和解释是 `direct`；adaptive 下的小型修改通常是 `guarded`。Plan 留给需要持久化 task 和 evidence 的工作。

### Strict 会给只读问题创建 plan 吗？

不会。只读分类发生在 strict 的实质性工作规则之前。Strict 改变的是实质性工作，不是普通解释。

### 另一个 client 可以用 "ok" 继续我的 plan 吗？

不能用弱确认直接继续。同会话 acknowledgement 要求原 client 和 session。若要有意把工作交给另一个 client，请使用显式 `resume`。

### Dry run 能证明 live provider 可用吗？

不能。Dry run 只证明本地 decision 或 preview 路径。Live Agent Team、Harness 和 Orchestrate 仍需要各自的 capability、human-gate 和 verification evidence。

### Planned decision 就等于修改完成吗？

不等于。它只是路由和持久化 decision。实现仍需执行选定的 process skill、pre-edit 检查、tests 和最终验证。

## 下一步

- [快速开始](getting-started.md)：初始化项目并运行 `aios doctor`。
- [架构](architecture.md)：了解策略、记忆、agents 和浏览器运行时的边界。
- [ContextDB](contextdb.md)：理解 pull-based 项目记忆和显式召回。
- [Agent Team](team-ops.md) 与 [Solo Harness](solo-harness.md)：选择并行或长时间执行。
- [Workflow Policy 发布文章](/blog/zh/2026-07-v400-adaptive-workflow-policy/)：阅读 v4.0 的原因与示例。

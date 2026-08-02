---
name: rex-workflow
description: Use when a Coding Agent needs to start, resume, or complete an evidence-driven software workflow through the rex-harness CLI.
---

# Rex Workflow

本 Skill 是 Coding Agent 使用 rex-harness CLI 的对外编排入口。它不选择 Capability，也不预设 Fast、Balanced 或 Deep；只消费内核返回的当前 compact Command。

## 何时使用

- 用户明确要求使用 rex-harness；
- 当前项目存在需要继续的 `.rex-harness/` 工作项；
- 软件任务需要按当前 Command 执行并提交可验证 Evidence。

## 启动或恢复

新任务使用稳定且可复用的 work-item key：

```bash
rex-harness start --work-item <key> --message "<用户目标>" --root <project-root>
```

继续任务只读取当前状态：

```bash
rex-harness resume --work-item <key> --root <project-root>
```

只有人工诊断或审计明确需要完整状态时才添加 `--full`。普通执行不要读取完整 Workflow。

## 单步执行循环

1. 校验返回对象是 `rex.cli.workflow-command.v1`，并先检查 compact 响应组合：

   | `status` | `command` | `missingEvidence` | 动作 |
   |---|---|---|---|
   | `active` | 非空 | 可为空或列出当前缺口 | 只执行当前 Command |
   | `completed` | `null` | 空数组 | 停止并确认工作流完成 |

   其他组合都表示状态损坏：fail-closed，不执行残留 Provider、不声明完成，不猜测、补写或伪造缺失 Evidence；重新读取可信状态并报告矛盾。
2. 一次只执行当前 `command`，不要自行选择或调用下一个 Provider。
3. `providerKind=skill` 时，通过客户端原生 Skill 发现加载 `providerId` 对应的 Skill；`instructionsRef` 是其权威来源引用。
4. `providerKind=agent` 时，只按 `instructionsRef` 加载本 Skill 的 `references/reviewers.json`，并根据当前风险证据选择恰好一名 Reviewer。没有风险证据时拒绝角色表演。
5. 只完成 `stageId` 和 `objective` 指定的当前阶段，收集 `expectedEvidence` 要求的真实引用。
6. 使用当前一次性 token 提交 evidence：

```bash
rex-harness evidence --activation <activationId> --command-token <commandToken> --evidence <kind>=<protocol:real-ref> --root <project-root>
```

7. 需要证明命令执行时，先建立回执：`rex-harness receipt --root <project-root> -- <command>`。失败测试的退出码写入回执而不是让 receipt 命令失败；RED 引用非零 `receipt:<id>`，通过和 hardening 场景引用零退出 `receipt:<id>`。
8. `rex-test-design` 的 `decide-testability` 阶段将类型化结论写入 JSON 文件，并通过 `rex-harness evidence ... --testability-file <decision.json>` 连同 `testability-decision-recorded=<decision-ref>` 提交。`behavior-delta` 只能带真实失败回执；`behavior-preserving-hardening` 只能带真实通过基线；`blocked` 会 replan 而不是重派发旧 Command。
9. Evidence 被接受后只读取返回的下一条 compact Command，重复以上步骤直到完成。

## 上下文和安全边界

- 不要一次加载全部 Provider Skill，只加载当前 `providerId` 对应说明。
- 完整历史保留在 `.rex-harness/`，不要复制进模型上下文或长期提示词。
- 不伪造命令执行、测试、差异、审查或文件引用，也不提交 placeholder、TODO 或 TBD。
- token 失效、状态损坏、Provider 无法解析、Evidence 类型不符或引用不可验证时 fail-closed，拒绝继续并报告具体错误。
- CLI 返回的 Capability、阶段和 Provider 是唯一执行授权；用户新目标必须建立新的工作项，不能借继续旧任务扩大范围。

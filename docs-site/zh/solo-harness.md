---
title: Solo Harness：可恢复长任务
description: 用运行日志、stop/resume 控制、验证证据和可选 git worktree 隔离运行一个明确目标。
---

# Solo Harness

## 一句话回答

当一个明确目标可能超过交互式会话时，使用 Solo Harness；它不适合需要并行 worker 的任务。它记录运行日志和检查点，支持 status、stop、resume，并可在 git worktree 中隔离变更。独立模块使用 Agent Team，按阶段的质量门禁使用 Orchestrate。

## 现在就做

在隔离 worktree 中启动有边界的任务：

~~~bash
aios harness run \
  --objective "重构 auth 模块并编写集成测试" \
  --session nightly-auth \
  --worktree \
  --max-iterations 20
~~~

查看状态：

~~~bash
aios harness status --session nightly-auth --json
aios hud --session nightly-auth --json
~~~

## 什么时候选择 Solo Harness

| 情况 | 路径 |
| --- | --- |
| 一个目标、一个供应商、长时间运行 | Solo Harness |
| 独立模块和不同负责人 | [Agent Team](team-ops.md) |
| 分阶段并有门禁 | aios orchestrate |
| 需求不明确或小修复 | 结合 Workflow Policy 使用交互式客户端 |

目标应让其他人可以判断是否完成，并写明范围、排除项和验证方式。

## Worktree 隔离

--worktree 会从选定 base ref 创建独立 git worktree。合并或复制前检查 worktree 和 diff。隔离不会让危险命令变安全，也不会绕过仓库政策。

## 先 dry-run 再 live

只创建日志，不调用供应商：

~~~bash
aios harness run \
  --objective "起草明天的交接" \
  --session test-run \
  --worktree \
  --max-iterations 3 \
  --dry-run --json
~~~

dry run 只能证明参数解析和本地日志创建，不能证明供应商、客户端、凭据或实时路由可用。

## 停止、检查和恢复

~~~bash
aios harness stop --session nightly-auth --reason "早间审查"
aios harness status --session nightly-auth --json
aios harness resume --session nightly-auth --max-iterations 10
~~~

resume 前阅读最后的 status、checkpoint 和失败命令。除非明确开始新 session，否则保持同一目标。

## Hooks 和供应商控制

生命周期 hooks 默认记录阶段证据；单次运行可以关闭：

~~~bash
aios harness run --objective "task" --session demo --hooks
aios harness resume --session demo --no-hooks
~~~

可以明确选择供应商：

~~~bash
aios harness run --objective "task" --provider codex --profile strict
~~~

供应商和路由支持仍需实时检查，不能从 dry-run 推断。

## 会写入什么

运行产物位于项目 ContextDB session 下：

~~~text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
  objective.md
  run-summary.json
  control.json
  hook-events.jsonl
  iteration-0001.json
  iteration-0001.log
~~~

日志和检查点属于项目数据。分享前脱敏凭据和私有供应商输出。

## 恢复清单

1. 读取 status 和最新 iteration log。
2. 找到第一个失败，而不只看最后症状。
3. 运行最小诊断命令。
4. 用明确原因 stop 或 resume。
5. 合并前验证 diff 和测试。

## 常见问题

### Solo Harness 保证一夜完成吗？

不保证。它提供可恢复循环和证据，但供应商限制、凭据、测试和任务复杂度仍可能中断。

### 每次都应该使用 --worktree 吗？

需要隔离或任务会修改代码时使用。只读或文档任务可以不使用，但要明确检查工作区边界。

### 包装客户端可以触发 harness 吗？

支持时，原生路由提示可以建议 harness 路径。仍应像普通 run 一样检查 status、供应商和证据。

## 下一步

- [Agent Team](team-ops.md) - 拆分独立工作。
- [HUD 指南](hud-guide.md) - 查看 session 细节。
- [工作流策略](workflow-policy.md) - 判断是否应该 planned。
- [故障排查](troubleshooting.md) - 恢复失败运行时。

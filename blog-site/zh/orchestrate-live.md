---
title: "Orchestrate Live：安全 opt-in 的 Subagent Runtime"
description: "理解 dry-run 与 live 编排的区别、受限并行 phase、JSON handoff、ownership 门禁和 provider 就绪度。"
date: 2026-06-20
tags: ["编排", "Subagent", "Agent Team", "dry-run", "runtime"]
---

# Orchestrate Live 终于不是摆设了：Subagent Runtime 正式可用

> **快速答案：** `dry-run` 只在本地生成并验证编排计划，不调用模型 runtime；`live` 是显式 opt-in，会通过选定 CLI 执行受限 phase，验证结构化 handoff，并阻止文件 ownership 冲突。dry-run 通过不等于 provider、浏览器或认证已就绪。

如果你一直把 `aios orchestrate` 当作「蓝图预览 + 本地 dry-run」的安全门禁，那么这次迭代补齐了最关键的一块：`subagent-runtime` 现在可以真正执行编排阶段任务了。

## 这次到底更新了什么

过去：

- `--execute dry-run` 只会生成 DAG 并产出模拟 handoff（0 token）
- `--execute live` 虽然有门禁，但运行时基本是 stub

现在：

- `--execute live` 会通过你选择的 CLI（`codex` / `claude` / `gemini`）执行每个 phase job
- 并发 phase 会按 `AIOS_SUBAGENT_CONCURRENCY` 控制并发度
- 并发组结束后会进入 merge-gate：校验 JSON handoff，并在文件所有权冲突时直接阻塞

## 默认依旧安全

live 默认关闭，必须显式 opt-in：

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli  # 或 claude-code, gemini-cli
aios orchestrate --session <session-id> --dispatch local --execute live --format json
```

提示（codex-cli）：推荐 Codex CLI >= v0.114。AIOS 会在可用时自动使用 `codex exec` 的结构化输出（`--output-schema`、`--output-last-message`、stdin），让 JSON handoff 更稳定。

关于 token 成本：

- `dry-run` 不会调用任何模型
- `live` 会调用所选 CLI，所以 token/费用取决于你用的客户端

## 常用环境变量

- `AIOS_SUBAGENT_CONCURRENCY`（默认：`2`）
- `AIOS_SUBAGENT_TIMEOUT_MS`（默认：`600000`）
- `AIOS_SUBAGENT_CONTEXT_LIMIT`（默认：`30`）
- `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET`（可选）

## 失败语义（你会看到什么）

`subagent-runtime` 会返回结构化的 per-job 执行结果。常见 `blocked` 原因包括：

- 上游依赖 job 已阻塞
- 选定 CLI 不在 `PATH` 或未安装
- 子代理输出不是合法 JSON（handoff 解析/校验失败）
- merge-gate 因并发分支“文件所有权冲突”而阻塞

## 为什么这很重要

这意味着「并发编排」终于从“纸面流程”变成了“可执行流程”，而且不需要引入新的闭源 runtime：

- 蓝图还是那套蓝图
- 记忆还是 ContextDB
- 合并规则还是显式的 ownership/merge-gate
- 只是把 live 执行补齐，并且依旧默认安全

## 2026-03-16 进展更新

发布后我们继续在同一 session 上做了多轮 live sample，验证稳定性：

- 最新 live artifact：`dispatch-run-20260316T111419Z.json`（`dispatchRun.ok=true`）
- 当上游 handoff 的 `filesTouched=[]` 时，`review` / `security` 会自动 `0ms` 完成
- `learn-eval` 平均耗时已改善到 `160678ms`，但 `sample.latency-watch` 仍在观察态
- timeout 预算目前仍不下调，继续按证据驱动推进（等待 latency-watch 清除及 Windows 主机验证闭环）

实践结论：live 编排已可稳定日常使用，但“降预算”必须等观测信号进一步收敛。

## 常见问题

### dry-run 会消耗模型 token 吗？

不会。dry-run 只在本地验证计划和模拟 handoff；live 会调用选定 CLI，因此可能产生 token 或供应商费用。

### 哪些情况会阻塞 live phase？

常见原因包括 CLI 不存在、handoff 不是合法 JSON、依赖任务被阻塞、文件 ownership 冲突、超时或需要人工门禁。重试前先读取结构化结果。

### live 默认开启吗？

不开启。它需要显式 opt-in，并且选定的 provider/client 必须实际可用。provider 就绪、认证状态和授权范围是三个不同的检查。

## 官方文档

参阅 [Agent Team](https://cli.rexai.top/zh/team-ops/)、[Workflow Policy](https://cli.rexai.top/zh/workflow-policy/)、[Solo Harness](https://cli.rexai.top/zh/solo-harness/) 和[故障排查](https://cli.rexai.top/zh/troubleshooting/)。

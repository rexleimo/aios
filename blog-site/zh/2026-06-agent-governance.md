---
title: "Agent 治理：让 Team live 运行先证明自己"
description: "Harness CLI 如何用 smoke 证据、provenance、token 压缩指标和 skill training gate，把更多 agents 融入统一工作流。"
date: 2026-06-16
tags: ["Agent Team", "governance", "smoke", "skills", "AIOS"]
---

# Agent 治理：让 Team live 运行先证明自己

添加更多 agents 并不难，难的是让它们足够可靠，可以进入真实 workflow。

Harness CLI 现在把 agent routing、team execution 和 skill update 都当成证据问题处理。workflow 进入 live 前，需要证明三件事：

1. agent 能跑通 smoke path，
2. 运行会留下 provenance 和 token-compression metrics，
3. 如果 skill 有改动，必须通过 training gate。

## 为什么需要治理

多 agent 系统常见的失败通常很普通：

- 某个角色在 client capability 验证前就开始 live work，
- skill 改了，但没人确认新指令是否完成训练，
- output compression 只对一部分 agent 生效，
- team run 看起来成功，却没有可审计的证据。

答案不是少用 agent，而是把 agent 准入做成无聊、可重复、fail-closed 的流程。

## 新 workflow

当你修改 routing、docs、skills 或 team behavior 时，先 dry-run 预览：

```bash
node scripts/aios.mjs agents smoke --dry-run --json
```

然后为当前 agent 集合记录 smoke 证据：

```bash
node scripts/aios.mjs agents smoke --json
```

如果改动触及 skills，在把 workflow 视为 ready 前运行 training gate：

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

这样操作规则就很简单：team 和 harness workflow 可以扩展，但被信任前必须留下证据。

## 会记录什么

每个 core-risk agent 会得到三类证据文件：

| Evidence | Path | Purpose |
|---|---|---|
| Smoke result | `.aios/agents/smoke/<agent>.json` | 证明 agent 跑通 smoke path |
| Provenance | `.aios/agents/provenance/<agent>.json` | 记录哪个 agent/client path 产生了证据 |
| Compression metrics | `.aios/interception/metrics/agents-smoke-<agent>.jsonl` | 确认 `pre_send` 和 `post_receive` token-compression accounting 带有 agent 身份 |

关键细节是 `agent_id`。没有稳定 agent 身份的 metrics 很难审计，所以 smoke 证据现在会把这个身份传过 compression data plane。

## 日常怎么用

这些情况需要走 governance path：

- 新增或重命名 agent role，
- 修改 team、harness 或 subagent routing，
- 修改 workflow skills，
- 更新 native client instructions，
- 准备发布涉及 agent orchestration behavior 的版本。

普通 feature work 仍然保持熟悉的用户流程：

```bash
aios team 3:codex "实现 settings page，添加测试，并更新文档"
aios team status --provider codex --watch
```

治理检查在这条流程背后工作，确保 team surface 在用户依赖它之前已经 ready。

## Skill 改动需要训练

Skills 是可执行的操作规程，不只是文档。只要 skill 发生变化，系统就应该验证 changed skill 走过 training gate。

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

这个命令是 gate，不是 warning。如果 training evidence 缺失，workflow 应该停止，不要让 live agent work 依赖新指令。

## 运行原则

更大的 agent system 只有一条简单规则：

> 只有 admission、provenance、compression 和 training 都可观测时，才接纳更多 agents。

这就是 Harness CLI 把更多 agents 融入同一个 system workflow 的方式，而不是让每次 team run 都变成信任跳跃。

---

阅读更新后的 [多 Agent 实战文档](https://cli.rexai.top/zh/team-ops/) 获取日常命令和治理清单。

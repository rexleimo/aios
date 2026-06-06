---
title: "v1.50.1：全客户端 Token 压缩合规"
description: "Harness CLI v1.50.1 用 pre_send、post_receive、proof 矩阵和 direct host bypass 违规记录，让所有 AIOS 客户端的省 token 指标可度量。"
date: 2026-06-05
tags: ["release", "token-compression", "AIOS", "multi-client", "proof"]
---

# v1.50.1：全客户端 Token 压缩合规

省 token 不能靠感觉。Agent 回答短一点不等于真的省。绕过 AIOS 的 raw host output 也不能算 savings。只证明 harness 一条链路，也不能说明所有客户端都遵循同一套合同。

Harness CLI v1.50.1 把这件事收敛到一个统一指标：`bidirectional-turn-compression`。

## 合同

每个 AIOS 托管的 agent turn 都必须有两个压缩点：

- `pre_send`：prompt/input 进入目标 client 或模型之前压缩。
- `post_receive`：client/model 输出被 AIOS 接受之前压缩。

客户端能力报告还要求：

- `requiredEntrypoint=aios-managed-runner`
- `directHostBypassAllowed=false`
- `uncontrolledHostOutput=policy-violation`

覆盖 Codex、Claude、Gemini、Antigravity、OpenCode、Crush、Cursor、`aios-harness` 和 `generic-mcp`。

## 证明，不是提示词

运行 proof：

```bash
node scripts/aios.mjs interception proof --json
```

JSON 输出现在包含 `turn_compression_matrix`。每一行都对应一个客户端/宿主，并报告 `pre_send`、`post_receive` 的 `saved_bytes`、`saving_ratio` 和合规状态。

查看 rollout 状态：

```bash
node scripts/aios.mjs clients doctor --json
```

文本 doctor 也会显示同一指标：

```text
compression=bidirectional-turn-compression entrypoint=aios-managed-runner pre_send=required post_receive=required bypass=policy-violation
```

## 不再有假 savings

如果输出没有经过 AIOS-managed turn boundary，v1.50.1 会记录为 uncontrolled host output：

- `policy_violation=true`
- `compliance_status=non_compliant`
- `saved_bytes=0`
- `saving_ratio=0`

这样就不能再用汇总 savings 掩盖 direct host bypass。

## 技能训练证据

本次发布还用 SkillOpt-Lite 训练了 `aios-interception-runtime` 技能。被接受的训练补丁增加了 skip discipline：Windows-only 这类平台门控 skip，不能和 token-compression 缺口混为一谈。

训练产物：

```text
.skillopt/aios-interception-runtime-2026-06-05
```

## 升级检查

升级后运行：

```bash
node scripts/aios.mjs interception proof --json
node scripts/aios.mjs clients doctor --json
npm run test:scripts
```

期望证据：

- `turn_compression_matrix.ok=true`
- 每个客户端都有非零 `pre_send.saved_bytes`
- 每个客户端都有非零 `post_receive.saved_bytes`
- uncontrolled output 被报告为 policy violation，而不是 savings

参考 [自研 Token 压缩文档](https://cli.rexai.top/zh/token-compression/#all-client-turn-compression-v1501)。

---
title: "v5.4.0：工作流迭代 v2.1 — Activation 安全、类型化 Evidence 契约与全量 Skill 审查"
description: "Harness CLI v5.4.0 新增原子化 Activation 状态写前事务、并发 token 锁、类型化 Wayfinder/Planning Artifact schema、严格 evidence ref 校验，并完成 S1–S5 全批次 Skill 审查。"
date: 2026-08-01
tags: ["Harness CLI", "rex-harness", "工作流", "evidence 契约", "activation store", "Skill 审查", "开发效率"]
---

# v5.4.0：工作流迭代 v2.1 — Activation 安全、类型化 Evidence 契约与全量 Skill 审查

> **结论先行：** v5.4.0 修复了 rex 工作流运行时中的三类无声故障——崩溃后的 Activation 状态分裂、并发下的 token 双重推进、以及通过 schema 校验的 placeholder evidence ref。同时发布了首套完整的 Wayfinder 与 Planning Artifact 类型 schema，并完成了所有 13 个 canonical Skill 的 S1–S5 审查。

## 这个版本解决了什么问题

当一个 coding agent 在工作流中途被打断——崩溃、断网、或并发调用——有两件事会悄无声息地出错：

1. Workflow 文件与 Activation 投影文件可能落入不同步状态。token 已轮转，但投影仍显示旧命令。agent 在过时状态上继续运行。
2. 两个并发调用可以同时获得同一个 Command token 并都成功，造成重复 evidence 接受但没有任何锁冲突。

在本版本之前，以上两种情况都不会产生明确错误——它们只是悄悄推进（或悄悄停滞）了工作流。

第三类故障是结构性的：Wayfinder 与 Planning Artifact 的 evidence `ref` 字段接受任意字符串，包括 `"TODO: fill in later"` 和不带协议前缀的裸文件名。校验门通过了，agent 继续推进，审查者拿到的是无效引用。

## 具体变更

### 写前事务的原子化 Activation store

Activation store 现在在触碰任何活跃状态之前，先写入一个 pending 事务文件：

```
.aios/workflow-activations/transactions/<activationId>.json.pending
```

如果进程在 Workflow 写入和 Activation 投影写入之间崩溃，下次启动时会检测到 pending 文件并向前 roll forward 事务。如果两次写入都已完成，pending 文件会作为最后一步被删除。这是纯 roll-forward 设计——store 从恢复后起始于一致的向前状态。

读取时，store 现在也校验投影记录的 Command token 是否与 Workflow 当前 token 一致。若出现分歧——这是旧代码在两次写入之间崩溃的特征——读取以 `stale-activation-projection` 失败关闭，而不是返回不匹配的状态。

### 单 token 序列化锁

per-store 文件锁现在阻止两个并发调用同时推进同一个 Command token。第二个调用者收到 `AIOS_REX_STORE_BUSY` 并需要重试。锁只在原子写入期间持有，普通的顺序使用不受影响。

### 类型化 Wayfinder 与 Planning Artifact schema

本版本发布两个新的领域模块：

- `src/domain/wayfinder-artifact.mjs` — 校验 Navigation Map、Decision Graph、Decision Ticket 和 Next Slice。`partial` 或 `blocked` 状态的 Wayfinder artifact 不能声明 Decision Ticket 或 Next Slice。
- `src/domain/planning-artifact.mjs` — 校验 Delivery Ticket、Frontier（ready 与 blocked 互斥且无重叠）、Parallel Group（同一工作项不能出现在多个组中）、Convergence Gate 和 Runtime Artifact Contract。

两个 schema 都经过 `normalizeEvidenceRefs()`，它拒绝任何缺少协议前缀（`artifact:`、`receipt:`、`diff:`、`command:` 等）或匹配已知 placeholder 模式（`TODO`、`TBD`、`placeholder` 等）的 `evidenceRef`。

### 可信备份恢复

Client projection 的 `recoverInterruptedArtifacts` 现在在提升备份前重新根据 `projection-history.json` 校验备份 marker digest。非受管 projection 创建的备份 junction，或 marker 被篡改的，会被以 `interrupted-backup-untrusted` 拒绝，而不是被悄悄恢复。

### Plan evidence mirror 失败可见性

`syncEvidenceToMatchingPlan` 之前在计划文件缺失或不匹配时会抛出异常，这意味着已提交的 Rex 状态可能对调用方表现为整体失败。现在它返回带有结构化错误码的 `planEvidence.status = 'failed'`，让调用方能区分"Rex 已接受 evidence"和"plan mirror 失败"。

### S1–S5 Skill 审查

所有 13 个 canonical Skill source 完成了 S1–S5 批次 SkillOpt eval：

| 批次 | Skills |
|---|---|
| S1 | `rex-requirements`, `rex-implement` |
| S2 | `rex-debug`, `rex-tdd` |
| S3 | `rex-wayfinder`, `rex-planning` |
| S4 | `rex-code-review` |
| S5 | `rex-design`, `rex-strict-tdd`, `rex-refactor-hardening`, `rex-minimal-construction`, `rex-test-design`, `rex-workflow` |

每个批次都产生了更新的 `evals/evals.json` 和更新的 canonical `SKILL.md`。当前 digest 已追加至 `projection-history.json`，旧 digest 保留用于回滚。

## 升级说明

- `rex-harness` 从 `0.4.3` 升级到 `0.5.0`。如果你直接使用 `recoverInterruptedArtifacts`，需要更新调用点：第二个参数现在是 `plan` 对象 `{ skillId, sourceDigest, historicalDigests }`，而非裸 `skillId` 字符串。
- 现有 `.aios/workflow-activations/` 状态只读兼容，无需迁移。旧代码留下的未完成事务将在首次访问时被检测并向前 roll forward。
- 工作流状态中已存储的 evidence ref 不会被追溯性重新校验。通过更新后的运行时提交的新 evidence 将强制执行协议前缀规则。

## 验证

```bash
npm run test:rex
# rex 191/191  contract 38/38  integration 52/52  workflow-policy 74/74

npm --prefix rex-harness run doctor
# status: ready，13 capabilities，6 clients，0 missing instructions
```

所有测试数字均为最终编辑后的 fresh 运行结果，非历史遗留数据。

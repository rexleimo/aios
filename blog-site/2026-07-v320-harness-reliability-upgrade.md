---
title: v3.2.0 — Harness 可靠性与技能生命周期升级
date: 2026-07-01
description: "连续失败自动中止、紧急压缩第三级、启动前预检、运行时指令注入、手动记忆整理、技能 stale 检测与文件级回滚"
---

# v3.2.0 — Harness 可靠性与技能生命周期升级

> 2026-07-01 · 基于竞品源码级差距分析，6 项改进直接提升 agent 配合质量

## 为什么发这个版本

上一版（v3.1.0）完成了 Hermes Agent 作为一等公民客户端的集成。但在实际长跑使用中，我们发现了几个可靠性短板：

1. agent 反复失败时 harness 无限重试，白白浪费 token
2. 长会话 canvas 节点膨胀到溢出
3. harness 启动时没有环境预检，跑到一半才发现 provider 不可达
4. 每轮 prompt 缺少一致的 directive 注入
5. 记忆系统没有整理机制，旧 memo 永远累积
6. skill workshop 的 rollback 只恢复 metadata，不恢复文件内容

本次 v3.2.0 逐一修复这些问题。所有改进都基于竞品源码级分析（gnhf / OpenHarness / TencentDB / the-pair / OpenClaw），不是 README 推断。

## 改进清单

### A1: consecutiveFailures 自动中止

**文件**: `scripts/lib/harness/solo-runtime/backoff.mjs` + `loop.mjs`

新增双计数器：
- `consecutiveFailures` — 所有非成功 outcome 都计入（blocked/failed/infra-retry/human-gate）
- `consecutiveInfraFailures` — 仅 infra-retry + runtime-error/tool-error 计入

当 `consecutiveFailures >= 5` 时，harness 自动 abort session 并记录 `consecutive-failures-abort` reason。成功/noop 重置所有计数器。退避仍保持 30s×2ⁿ cap 300s。

**竞品参考**: gnhf `orchestrator.ts:361-368` 的 `consecutiveFailures` 计数器。gnhf 的退避无 cap 是 bug，我们的 300s cap 是正确做法。

### A2: Emergency 压缩第三级

**文件**: `scripts/lib/offload/mermaid-canvas.mjs`

在原有的 mild（20 节点）/ aggressive（50 节点）之上，新增 emergency 级别：

| 级别 | 触发阈值 | 保留最近节点数 |
|------|----------|---------------|
| mild | 20 | 10 |
| aggressive | 50 | 10 |
| **emergency** | **100** | **5** |

emergency 模式的 summary node 标记为 `offload:compact-emergency`，保留更少的最近节点以防止 canvas 自身过大导致 context overflow。

**竞品参考**: TencentDB `l3.ts` 的 emergency 级别（0.95 触发，目标 0.6）。

### A3: Dry-run Readiness 预检

**文件**: `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs`（新文件）+ `loop.mjs`

harness 启动前检查 4 个维度：

| 维度 | 检查内容 | blocked | warning |
|------|---------|---------|---------|
| ContextDB | `.aios/context-db/index.json` 是否存在且可读 | — | 缺失或损坏 |
| Git | `.git` 目录是否存在 | worktree 模式下必须 | 非 worktree 模式下降级 |
| Provider | provider 字段是否非空 | — | 为空且无 AIOS_MODEL_ROUTER |
| Session | resume 时 session 目录是否存在 | — | 不存在则从新开始 |

`blocked` 级别直接阻止 harness 启动，避免 agent 跑了一半才发现环境问题。

**竞品参考**: OpenHarness `cli.py:333-393` 的 `_evaluate_dry_run_readiness()`。

### B1: Runtime Directive 注入

**文件**: `scripts/lib/lifecycle/harness/directive-inject.mjs`（新文件）+ `prompt.mjs`

从 `.aios/config.json` 读取 `default_mode`，将对应的 `systemPromptAdditions` 注入到每轮 harness 迭代 prompt 前面。支持 3 个内置预设和自定义 `mode_presets`。

```json
{
  "default_mode": "strict-primary"
}
```

注入后 prompt 包含：
```
--- Runtime Directive ---
You must follow the superpowers workflow before any implementation action.
Invoke verification-before-completion before claiming a task is done.
--- End Runtime Directive ---
```

这是原创的 directive 体系，不是抄 oh-my-openagent 的 ULTRAWORK 关键词检测（那只是 runtime hook，不是 config 字段）。

### B2: Auto-dream 手动 CLI

**文件**: `scripts/lib/memo/autodream.mjs`（新文件）

提供手动记忆整理 CLI：

```bash
# 预览模式 — 只输出计划，不执行
node scripts/lib/memo/autodream.mjs --root /path/to/workspace --mode preview

# 执行模式 — 实际清理过期和重复的 memo
node scripts/lib/memo/autodream.mjs --root /path/to/workspace --mode apply
```

封装已有的 `runDream` 管道（taxonomy 分类 + Jaccard 去重 + TTL 过期）。Phase A 是手动触发；Phase B 将加入定时自动触发。

### B3: Skill Workshop stale 检测 + 文件级 rollback

**文件**: `scripts/lib/skills/skill-workshop.mjs`

**Stale 检测**: apply 前比对目标 `SKILL.md` 的文件系统 hash 与 lock 中的 `computedHash`。不一致说明 skill 被外部修改过 → 拒绝 apply，防止覆盖用户的手动修改。

**文件级 rollback**: apply 前将完整的 `SKILL.md` 内容存入 `lock.rollbackSnapshot.previousContent`。rollback 时可以恢复实际文件内容，不只是 metadata。

```json
{
  "rollbackSnapshot": {
    "previousContent": "# 原始 SKILL.md 完整内容...",
    "computedHash": "abc123...",
    "path": "skill-sources/my-skill/SKILL.md"
  }
}
```

**竞品参考**: OpenClaw `workshop/types.ts:86-99` 的 `SkillProposalRollback.previousContent`。

## 验证

所有改动通过 37/37 单元 + 集成测试：

| 模块 | 测试数 | 覆盖场景 |
|------|--------|---------|
| A1 backoff.mjs | 13 | success reset / infra-retry / blocked / human-gate / abort threshold / cap |
| A2 mermaid-canvas.mjs | 8 | none/mild/aggressive/emergency 阈值边界 |
| A3 dry-run-readiness.mjs | 10 | blocked/warning/ready / context-db / git / provider / resume |
| B1 directive-inject | 8 | 内置预设 / 自定义预设 / prompt 注入 / null rootDir / corrupt config |
| B2 autodream | 5 | preview / apply / CLI --help / CLI preview 执行 |
| B3 skill-workshop | 3 | apply / rollback / import 验证 |

## 竞品分析报告

本次改进基于以下源码级分析报告（见 `docs/reports/`）：

- `2026-07-01-source-level-gap-analysis.md` — 6 个竞品的源码级差距分析
- `2026-07-01-enhancement-value-assessment.md` — 按 agent 配合价值重新排序的评估报告

## 升级建议

```bash
# 更新到最新版
aios self-update

# 验证 dry-run readiness
node scripts/lib/harness/solo-runtime/dry-run-readiness.mjs

# 配置 runtime directive（可选）
echo '{"default_mode":"strict-primary"}' > .aios/config.json

# 手动试跑 auto-dream
node scripts/lib/memo/autodream.mjs --root . --mode preview
```

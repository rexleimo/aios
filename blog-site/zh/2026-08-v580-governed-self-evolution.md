---
title: "v5.8.0：AIOS 安全地自我迭代——Session Memory、证据门禁与可回滚晋级"
description: "AIOS v5.8.0 修复 memo 触发链，并加入带确定性验收���灰度晋级、审计和回滚的自我迭代管道。"
date: 2026-08-22
tags: ["AIOS", "发布", "自我迭代", "记忆", "治理", "memo", "dream"]
---

# v5.8.0：AIOS 安全地自我迭代

这次发布解决了一个实际问题：AIOS 有 memo、session-close candidate 和 dream，但正常 session 结束没有接上 `autoMemoSessionClose()`，所以候选很少产生，dream 长期不会触发。

## 新的闭环

```text
session 结束 -> reviewable candidate -> trigger/status
-> dream proposal -> deterministic verdict -> approval/canary
-> telemetry -> rollback 或 stable
```

候选只会进入待审核状态，不会直接污染 active shared memory。

## 主要更新

### Session close 自动生成候选

正常完成、中止、timeout 和异常退出统一使用幂等 finalizer。重复退出钩子会复用同一个 `candidateId`，不会重复写入，也不会直接发布到 active recall。

```bash
aios evolution status
```

该命令会显示待处理候选数量、上次 consolidation、cooldown、下一次可运行时间，以及为什么当前没有触发。

### 显式触发 consolidation

支持三种方式：

- `manual`：显式运行；
- `threshold`：默认累计 5 个候选；
- `schedule`：默认距离上次成功运行 24 小时。

默认策略仍然保守：不调用 LLM 自动晋级，不绕过 proposal 和审批。

### 验收标准变成可执行 contract

每个 candidate 都要通过 schema、provenance、scope、安全扫描、baseHash、原任务 replay、holdout、回归指标、memory 冲突和 supersede 检查。结果写成稳定 JSON verdict，而不是只依赖模型的自然语言判断。

### 版本化晋级和回滚

```text
candidate -> reviewing -> validated -> proposed -> approved
          -> canary -> active -> stable
          -> rejected | degraded | rolled_back
```

所有状态变化都有审计事件。canary 保存上一个 stable 版本；功能、安全、质量或成本退化时可以回滚。验收器、晋级 broker、回滚控制器等 trusted core 不允许被 candidate 修改。

### 更新通知

v5.8.0 增加版本兼容检测和去重通知，区分 patch/minor/major、stable/beta/dev channel、脏工作区、运行中的任务、安全更新和网络检查失败。

“允许更新”只表示策略允许进入更新流程，并不意味着 Agent 可以自行安装；安装仍需要用户命令或独立批准。

## 升级

```bash
aios update --check
aios evolution status
```

已有 memo 数据不需要迁移。升级后，新的 session 结束路径会从后续会话开始生成候选。

## 验证

本版本包含失败轨迹、replay/holdout、恶意内容、冲突 memory、supersede memory、stale baseHash 和 trusted-core 修改等固定 fixture，覆盖从 candidate 到 canary、rollback 的完整生命周期。

AIOS 的自我迭代不是偷偷修改自己，而是收集证据、提出受限变更、独立验收，并保留可逆的版本记录。

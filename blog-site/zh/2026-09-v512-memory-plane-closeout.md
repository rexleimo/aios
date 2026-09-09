---
title: v5.12.0 记忆系统收尾——从能存到能管：卫生、报表、迁移导入、分级加载
date: 2026-09-09
description: "memo 卫生命令（零删除）、aios memory report 全记忆面报表、aios import 迁移旧记忆为受治理候选、AgentView T0-T3 分级、Autodream opt-in 触发、embedding 粗排默认关。真实语料基线 top-1 98%。"
---

# v5.12.0 记忆系统收尾——从能存到能管：卫生、报表、迁移导入、分级加载

> 2026-09-09 · 记忆 backlog 13 项全部关闭（10 项落地 + 3 项核实，其中两项早已上线只是没回填状态）。回归 1106 用例 / 0 失败。

## 快速答案

v5.11.0 立"写入门槛"，本版补"存后管理"：pinned 超限报警并给整理入口（只归档永不删除）、一条命令看全记忆面、旧记忆迁移进治理队列、sub-agent 上下文四档分级带预算账、Autodream opt-in 自动触发。无破坏性变更，拉取即用。

```bash
aios memo hygiene          # 只读体检 + 整理提案
aios memory report         # 每 space 体量/失效比/候选积压/采纳率
aios import --format claude --file ~/MEMORY.md --dry-run
```

## 核心变更

- **memo hygiene（E2+E3）**：survey 列 sessions/pinned/事件体量；`--archive-stale-sessions` 移动归档（冲突即拒）、`--rotate-events` keep-newest 轮替（moved+kept 对账 + sha256）；永不 delete，space 级活 session 永不归档。
- **memory report（G2）**：每 space 体量/失效比/候选四态/feedback 采纳率/pinned 预算，`--json` 可读，与 doctor 不重叠。
- **aios import（F3）**：Claude/Continue/Roo/CONVENTIONS 四格式 → 受治理 candidate（无发布身份写入，B1 不可绕过），幂等 + `#import-<format>` 溯源，落地页 `docs/import-migration.md`。
- **渐进披露 + pinned 预算（C3+C4）**：`search --level summary` 每行约 100 token + `pack:` footer；`pin status` 打印三元组，超限标 truncated。
- **AgentView 分级（H1）**：T0-T3 四档 + 每档字符预算账；`ctx-agent.mjs workspace-view` pull-based 读取，默认 T3 旧调用方零破坏。
- **Autodream Phase B（E1）**：`AIOS_AUTODREAM_AUTO=1` 开启 close+空闲双触发，只跑 preview 走治理 apply；dream 零 LLM 即最便宜路由。
- **embedding 粗排 + 真实基线（A4+G1）**：`AIOS_MEMO_EMBEDDER=hash-lexical` 默认关、union-only 只加不删（AB 第五臂零漂移）；真实语料基线 top-1 98% / top-5 100%。
- **核实关闭（C1/C2/F2）**：预算降级投影与 orchestrate 调用链已落地；refs/canvas 早已上线；generatedTargets 是能力推导非硬编码，差距缩水为 workbuddy 一个待证目录。F1 补上乐观锁冲突自动留痕。

## 升级说明

无破坏性变更。回归 1106 用例 / 0 失败（101 文件含 9 个新套件），AB 五臂零漂移。

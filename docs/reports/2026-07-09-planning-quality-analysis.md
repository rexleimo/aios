# 竞品 × 仓库：记忆与智能规划质量分析（v2 主线）

> 日期: 2026-07-09  
> 前置: adoption 层已落地（always-on、superpowers 安装、A1–A4/B3 MVP）  
> 本文件: **真正抬高规划/记忆质量** 的差距与本轮实现

---

## 1. 竞品要点（只保留对质量有用的）

### 智能规划

| 竞品信号 | 质量含义 | AIOS 过去缺口 | 本轮动作 |
|----------|----------|---------------|----------|
| superpowers writing-plans 任务分解 | 可执行任务 + 验收 | md 只有 Task 1/2 占位 | **结构化 tasks + route 种子** |
| verification-before-completion | 证据才能完成 | set-status done 无门槛 | **done 门：任务全完成 + evidence** |
| ECC skill-comply / gates | 行为可测 | 仅 dry-run | 仍 Pending (B2) |
| OMO lean directive | 上下文留给任务 | 注入曾过长 | A1 lean 已做；v2 lean 带 next task |
| gnhf/OpenHarness 循环 | 状态机 | plan 无进度 | **progress + next task 注入** |

### 记忆

| 竞品信号 | 质量含义 | AIOS 现状 | 本轮/后续 |
|----------|----------|-----------|-----------|
| Letta dream → AGENTS | 记忆反哺指令 | dream --to 已 MVP | 加深 LLM 摘要后续 |
| Graphiti 事实时效 | 冲突不硬删 | 仅 TTL dream | C 级后续 |
| TencentDB recall 预算 | 回忆可控 | 已有 budget | 维持 |
| mem0 跨 client hook | 写回时机 | 投影/memo 有 | 与 plan evidence 联动后续 |

---

## 2. 仓库对照（关键路径）

| 模块 | 路径 | 问题 |
|------|------|------|
| plan 指针 | `.aios/planning/active.json` | 曾 schema v1 无 tasks |
| plan md | `docs/plans/*.md` | 模板空洞 |
| always-on | `planning/auto-gate.mjs` | 只强迫「有 plan」，不强迫「做对 task」 |
| verification | `harness/verification-evidence.mjs` | 未接到 plan done |
| memo/dream | `lifecycle/dream/*` | 与 plan 进度脱节 |

---

## 3. 本轮质量升级（Planning Quality v2）

1. **schema v2**: `tasks[]`, `route`, `skills[]`, `evidence[]`  
2. **route 分类**: design / implement / debug / verify / ops → 不同任务种子 + skill 序列  
3. **CLI**: `plan task`, `plan add-evidence`, `plan gate`；`set-status done` 强制门禁  
4. **注入**: lean 块带 `progress` + `next` task  

---

## 4. 验收（质量层）

| 标准 | 验证 |
|------|------|
| 新 plan 含 ≥3 tasks 与 route | `plan start` JSON / 单测 |
| 未完成任务时 done 失败 | 单测 + CLI |
| 无 evidence 时 done 失败 | 单测 + CLI |
| 任务更新改变 progress | `plan task t1 --status done` |
| lean 注入仍 &lt;900 且含 next | 单测 A1 |

```bash
node --test scripts/tests/planning-contract.test.mjs scripts/tests/competitor-iteration.test.mjs
node scripts/aios.mjs plan start --title "quality" --task "fix auth timeout"
node scripts/aios.mjs plan gate --json
# expect NOT ready
```

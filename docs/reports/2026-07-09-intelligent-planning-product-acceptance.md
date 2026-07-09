# 智能规划整体产品 — 验收报告

> 验收日期: 2026-07-09  
> 标准: **整体产品**（Adoption + Planning Quality + Runtime 闭环），非单项 MVP  
> 执行: 自动化测试 + CLI 探测 + 代码面检索  
> **总 verdict: FAIL（L3 未完全关闭）— L1+L2 PASS；P9 runtime 回写已补**  
> 复验日期: 2026-07-09（P0 harness plan writeback 后）

---

## 0. 标准定义（本轮验收基准）

智能规划**整体产品**必须同时满足三层：

| 层 | 含义 | 不满足则 |
|----|------|----------|
| **L1 Adoption** | 各客户端能发现并进入 AIOS 规划 | 规划被宿主绕过 |
| **L2 Planning Quality** | 结构化任务、路由、进度、证据完成门 | 只有空 plan 文件 |
| **L3 Runtime 闭环** | 执行过程自动回写 plan；完成可人审/可实跑合规 | plan 与执行脱节 |

**完成定义**: L1∩L2∩L3 全 PASS，且自动化门全绿。  
任一层 FAIL → **整体产品未完成**。

---

## 1. 验收结果总表

| ID | 标准 | 层 | 结果 | 证据摘要 |
|----|------|----|------|----------|
| P1 | 规划 skill 六客户端可发现 | L1 | **PASS** | `plan doctor --json` → ok=true, 6/6 |
| P2 | always-on / 自动门控存在 | L1 | **PASS** | auto-gate + Claude hook + ctx-agent prepend |
| P3 | superpowers 可安装/可 doctor | L1 | **PASS** | doctor 可跑；版本可能 WARN(&lt;6.1.0) 不阻塞 |
| P4 | plan schema v2 + route 种子任务 | L2 | **PASS** | start → schema=2, route=debug, tasks=4 |
| P5 | done 无证据/未完成任务必须拒绝 | L2 | **PASS** | gate ok=false；set-status done → err |
| P6 | lean 注入含 next + evidence 要求 | L2 | **PASS** | chars=415, hasNext/hasEvidence |
| P7 | 任务状态/证据 CLI | L2 | **PASS** | `plan task` / `add-evidence` / `gate` |
| P8 | 自动化回归 | L1+L2 | **PASS** | 19 tests pass |
| P9 | harness/solo **自动**回写 task | L3 | **PASS** | `plan-runtime.mjs` + solo `loop.mjs` + phase-job + quality-gate evidence；test `plan-runtime.test.mjs` |
| P10 | skill comply **live** | L3 | **FAIL** | 仍 dry-run only |
| P11 | Plan Canvas / 人审面 | L3 | **FAIL** | 无实现 |
| P12 | 记忆↔规划强闭环（dream 驱动 plan） | L3 | **FAIL** | dream --to 有，未驱动 plan 任务 |
| P13 | 远程 main 已发布 | 发布 | **N/A/FAIL*** | 本地多 commit 未必已 push |

\* 以 `git status` 相对 origin 为准；验收机未强制 push。

---

## 2. 分层 verdict

| 层 | Verdict | 说明 |
|----|----------|------|
| L1 Adoption | **PASS** | 入口、投影、skill 发现达标 |
| L2 Planning Quality | **PASS（核心 CLI）** | 结构化 plan + 证据门已达标 |
| L3 Runtime 闭环 | **PARTIAL** | P9 回写已通；P10–P12 仍缺 |
| **整体产品** | **FAIL** | 因 P10–P12 未过，仍不能宣称「智能规划整体产品完成」 |

---

## 3. 自动化证据（复现命令）

```bash
# P8
node --test scripts/tests/planning-contract.test.mjs \
  scripts/tests/competitor-iteration.test.mjs \
  scripts/tests/superpowers-version.test.mjs
# → 19 pass

# P1
node scripts/aios.mjs plan doctor --json
# → ok: true, 6 clients

# P4–P5
WORKDIR=$(mktemp -d) && cd "$WORKDIR"
node /path/to/harness-cli/scripts/aios.mjs plan start \
  --title "accept-probe" --task "fix login regression bug" --json
node .../aios.mjs plan gate --json          # ok:false
node .../aios.mjs plan set-status --status done  # err cannot mark plan done
```

2026-07-09 实测：

- tests: **19 pass / 0 fail**
- doctor: **6/6 ok**
- start: **schema 2, route debug, 4 tasks**
- gate: **NOT ready**（符合 P5）
- lean: **415 chars, next+evidence**

---

## 4. 对「已经做好了吗」的最终答复

| 问法 | 答案 |
|------|------|
| Adoption + 质量 CLI 是否可用？ | **是（L1+L2 PASS）** |
| 智能规划**整体产品**是否完成？ | **否（L3 FAIL → 总 FAIL）** |
| 能否对用户宣传「智能规划产品已交付」？ | **否**；可宣传「规划契约 v2 + 证据门 + 多客户端入口」 |

---

## 5. 达到整体 PASS 的剩余工作（按优先级）

| 优先级 | 工作 | 关闭哪条 |
|--------|------|----------|
| ~~P0~~ | ~~solo/team harness 回写~~ | **Done** — `plan-runtime.mjs` |
| ~~P0~~ | ~~verification → plan evidence~~ | **Done** — `verification-evidence.mjs` |
| **P1** | skill comply --live（至少 1 skill 实跑场景） | P10 |
| **P1** | 最小 Plan 审阅（本地 HTML 或 `plan show` 人类可读进度） | P11 |
| **P2** | dream 结果可生成/更新 plan tasks | P12 |
| **发布** | `git push` + 可选版本号 | P13 |

**整体产品再验收**: 重跑本文件 §1 表，**P10–P12** 变 PASS 且 §3 命令全绿 → verdict 改为 **PASS**。

---

## 6. 签署

| 角色 | 结论 |
|------|------|
| 验收执行 | 2026-07-09 按整体产品标准：**FAIL** |
| 可交付子集 | L1+L2 可作为 **「规划基础设施 v2」** 交付，不得称为整体产品完成 |

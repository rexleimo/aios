# 竞品刷新 → AIOS 可迭代功能报告

> 日期: 2026-07-09  
> 范围: watchlist schema v3 三支柱 12 项（memo / 智能规划 / team 工作流）  
> 方法: GitHub API 元数据 + Releases 正文 + 本仓库源码对照  
> 网络约束: `raw.githubusercontent.com` 源码直拉失败；以 API releases/commits + 本地 AIOS 源码审计为主  
> 基线: 上次 deep-dive ~2026-06-04/14；上次价值评估 2026-07-01

---

## 0. TL;DR

1. **07-01 列出的 A/B 项大部分已在 AIOS 落地**（consecutiveFailures abort、dry-run readiness、emergency compact、skill workshop 文件级 rollback/stale、dream Phase A、default_mode + directive inject、recall 预算）。
2. **2026-07-09 规划对齐后已追加落地**：always-on 规划、superpowers 版本感知安装、**A1 lean inject**、**A3 death-notice 接线**、**A2 dream --to**、**A4 MCP desc compact**、**B3 skill repair**。验收见 `2026-07-09-competitor-iteration-acceptance.md`。
3. **下一轮仍可做**：Plan Canvas (B1)、skill comply --live (B2)、记忆时序/pipeline (C*)。
4. **不建议跟**: 渠道网关 / 桌面端 / GPU 向量 / 向量库大全家桶 / OpenClaw 移动端 — 偏离三支柱。

---

## 1. 元数据快照（相对 watchlist 记录）

| 项目 | 上次记录 | 当前 (2026-07-09) | Δ 信号 |
|------|----------|-------------------|--------|
| TencentDB-Agent-Memory | v0.3.6 / 4.7k★ | **v1.0.0** / 7.7k★ / push 06-26 | **正式服务化 GA** |
| mem0 | cli-node-v0.2.8 / 57k★ | **v2.0.11** / 60k★ / push 07-08 | TS SDK 向量后端扩展 + 安全加固 |
| Graphiti | v0.29.1 / 27k★ | v0.29.2 / 28.5k★ / push **今天** | 质量/CI；核心仍是图谱抽取 |
| Letta Code | v0.27.3 / 2.6k★ | **v0.27.29** / 2.8k★ / push 今天 | **`letta dream --to/--from`** |
| OpenViking | v0.3.23 / 25k★ | **v0.4.8** / 26.4k★ | 大版本：记忆 v3、MCP compact、插件 marketplace |
| superpowers | v5.1.0 / 217k★ | **v6.1.1** / **250k★** | Codex 打包、bootstrap 瘦身、去掉 Gemini |
| Hermes | v2026.5.29 / 179k★ | **v2026.7.7.2** / **211k★** | 桌面/渠道爆炸增长；AIOS 侧基线能力已 Done |
| OpenHarness | v0.1.9 / 13.5k★ | v0.1.9 / 14.6k★ / push 06-04 | **基本静默** |
| oh-my-openagent | v4.7.5 / 60k★ | **v4.16.0** / 65k★ | LazyCodex 瘦 prompt、skill 纪律、install repair |
| gnhf | v0.1.42 / 1.8k★ | v0.1.42 / 3.0k★ / push 06-10 | 静默；abort 模式 AIOS 已吸收 |
| ECC | (无 stars 记录) | v2.0.0 + main 新 commit | **Plan Canvas**、Hermes/OpenClaw install、Kimi |
| OpenClaw | v2026.6.1 / 376k★ | **v2026.7.1-beta** / 382k★ | 渠道/插件/capability profiles；生态级噪声大 |

---

## 2. 本仓库已吸收（勿重复立项）

| 能力 | 竞品来源 | AIOS 证据 |
|------|----------|-----------|
| consecutiveFailures abort | gnhf | `scripts/lib/harness/solo-runtime/backoff.mjs` + loop 接线 |
| dry-run readiness | OpenHarness | `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs` |
| emergency 压缩 | TencentDB L3 | `scripts/lib/offload/mermaid-canvas.mjs` emergency 级 |
| skill workshop 文件 rollback + stale | OpenClaw | `scripts/lib/skills/skill-workshop.mjs` |
| dream Phase A（规则分类/去重/TTL） | OpenHarness autodream / Letta sleeptime | `scripts/lib/lifecycle/dream/*` + `aios dream` |
| default_mode + directive inject | oh-my-openagent 思路（原创落地） | `scripts/lib/lifecycle/options/default-mode.mjs` + `directive-inject.mjs` |
| recall char 预算 | TencentDB | `scripts/lib/search/budget.mjs` + unified-search |
| worker_died **协议对象** | overstory 模式 | `scripts/lib/lifecycle/death-notice.mjs`（模块级 Done） |
| Hermes 基线映射 | Hermes | `docs/hermes-inspired-capability-mapping.md` 多项 Done |

---

## 3. 推荐迭代清单（按三支柱 + ROI）

### A. 本周项 — 2026-07-09 迭代状态

| # | 功能 | 状态 | 验收证据 |
|---|------|------|----------|
| **A1** | Lean always-on 注入 | **Done** | `auto-gate.mjs` lean &lt;900 chars；test `A1 lean…` |
| **A2** | `dream --to` pin/agents | **Done** | `dream/export-to.mjs`；CLI `--to`；test `A2 writeAgents…` |
| **A3** | death-notice 接线 | **Done** | `phase-job.mjs` + `team status` 行；test `A3 death notice…` |
| **A4** | MCP desc compact | **Done** | `mcp-compact.mjs` + `AIOS_MCP_TOOL_DESC`；test `A4…` |

### B. 本月项

| # | 功能 | 状态 | 验收证据 |
|---|------|------|----------|
| **B1** | Plan Canvas | **Pending** | 下一轮 |
| **B2** | Skill compliance --live | **Pending** | 仍 dry-run only |
| **B3** | Skill install stale repair | **Done** | `plan repair-skills`；test `B3 repair…` |
| **B4** | MCP compact（同 A4） | **Done** | 见 A4 |

### C. 季度级 / 可选（对齐 memo 深度，勿抢优先级）

| # | 功能 | 来源 | 说明 |
|---|------|------|------|
| **C1** | Memo 事实时效 `valid_at`/`invalid_at`（软失效非删除） | Graphiti bi-temporal | dream TTL 是类级过期；缺「事实被新事实取代」语义。适合 ContextDB event 扩展字段 |
| **C2** | 记忆管线可观测（pipeline status） | TencentDB **v1.0.0** `/v2/pipeline/status` | 不必做独立 Gateway；可对 dream/offload 暴露 `aios memo pipeline status` |
| **C3** | Per-conversation capability profile | OpenClaw scoped conversations | team/subagent 按任务收紧工具面；与现有 capability manifest 合流 |
| **C4** | 记忆插件 marketplace 式安装 | OpenViking Codex/Claude 远程 marketplace | AIOS 已有 multi-client projection；可借鉴「远程 skill pack」安装体验，非重做 marketplace |

---

## 4. 明确不跟（或仅观察）

| 信号 | 项目 | 原因 |
|------|------|------|
| 渠道/WhatsApp/桌面 UI | Hermes v0.18、OpenClaw 渠道修复 | 非 AIOS 核心；Hermes 映射已 Deferred |
| cuVS GPU 向量 / 递归爬站 | OpenViking v0.4.8 | 重量级 infra，偏离本地-first memo |
| 全量向量库适配器 | mem0 TS SDK | AIOS 文件 memo + 搜索足够；运维成本不划算 |
| 独立 Memory Gateway 商业化 | TencentDB v1.0 | 可参考 API 形状；**不要**把 AIOS 改成远端记忆服务 |
| OpenHarness 新功能 | 自 06-04 无 release | 已吸收 dry-run/dream 思路；降监控频率 |
| gnhf 新功能 | 静默 | abort 已吸收；退避无 cap 勿抄 |

---

## 5. 与 07-01 评估的差分

| 07-01 项 | 2026-07-09 状态 |
|----------|-----------------|
| A1 consecutiveFailures | **已实现** |
| A2 Dry-run readiness | **已实现** |
| A3 emergency 压缩 | **已实现**（canvas 路径） |
| B1 default_mode | **已实现**（config + inject） |
| B2 Auto-dream Phase A | **已实现**；下一跳是 **dream --to 写出** |
| B3 skill workshop rollback+stale | **已实现** |
| C skill compliance 实跑 | **仍待做**（仍 dry-run only） |
| worker_died | **协议有 / 调度闭环未接** |

结论：不要再按 07-01 的 A 清单开工；按本文 **A1–A3 / B1–B4** 推进。

---

## 6. 建议实施顺序（单线程）

```text
1) A1 瘦 bootstrap / 最小 directive     — 立刻降每会话 token
2) A3 death-notice 接入 team            — 可靠性，改动面小
3) A2 dream --to AGENTS.md              — memo→规划 闭环
4) B4 MCP description compact           — 便宜
5) B3 skill install repair              — 多 client 稳定性
6) B2 skill comply --live               — 需要 eval 预算
7) B1 Plan Canvas                       — 体验向，可并行设计
```

---

## 7. 证据与方法备注

- 元数据缓存: `/tmp/comp-refresh/*.json`（本机会话）  
- 权威清单: `docs/reports/competitor-watchlist.json` schema v3  
- 本地对照: `scripts/lib/harness/solo-runtime/*`, `scripts/lib/lifecycle/*`, `scripts/lib/skills/*`, `scripts/lib/search/*`  
- 未完成项: 全量 raw 源码 tree walk（网络限制）；下一轮可对 A/B 项做 targeted Contents API 文件读取后补「源码级」引用  

---

## 8. 一句话路线

**AIOS 已完成「竞品有的基础能力抄齐」阶段；下一阶段是把记忆整理结果写回规划指令、把规划上下文变瘦、把 team 死亡信号接进调度、把 skill 是否真执行做可验证。**

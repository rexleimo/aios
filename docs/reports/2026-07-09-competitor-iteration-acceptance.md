# 竞品借鉴迭代 — 验收标准与验证方法

> 日期: 2026-07-09  
> 范围: 规划对齐后的竞品 backlog 顺序实现（A1 → A3 → A2 → A4 → B3）  
> 原则: **证据优先** — 每项必须有命令输出或测试结果，禁止只靠文档声称完成

---

## 0. 总验收门（整轮 Done 才算闭环）

| # | 门禁 | 命令 | 通过标准 |
|---|------|------|----------|
| G1 | 单元/契约测试绿 | `node --test scripts/tests/planning-contract.test.mjs scripts/tests/competitor-iteration.test.mjs scripts/tests/superpowers-version.test.mjs` | exit 0, fail=0 |
| G2 | 规划 skill 可发现 | `node scripts/aios.mjs plan doctor --json` | `ok: true`，6 客户端 |
| G3 | Superpowers 健康 | `node scripts/aios.mjs internal superpowers doctor --client all` | 无 ERR；版本 WARN 可接受若网络未 pull |
| G4 | 本文件 backlog 状态表与代码一致 | 人工对照 §1 表 | Done 项均有代码路径 |

---

## 1. 分项验收标准

### A1 Lean always-on 注入

| 字段 | 内容 |
|------|------|
| **目标** | 每条消息仍进规划，但注入文本不主导上下文 |
| **实现** | `scripts/lib/planning/auto-gate.mjs` `mode=lean`（默认） |
| **验收** | lean 注入 **&lt; 900 chars**；含 plan 路径 + writing-plans |
| **验证** | `node --test` 含 `A1 lean always-on directive stays under 900 chars` |
| **手动** | `node scripts/aios.mjs plan auto-gate --task "x" --json` → `injection` 长度 &lt; 900 |
| **失败表现** | 每轮 prompt 暴涨、truncation |

### A3 death-notice 接入 team/subagent

| 字段 | 内容 |
|------|------|
| **目标** | worker 失败时 parent 可看到结构化死亡通知 |
| **实现** | `phase-job.mjs` 失败写 notice；`team status` 展示 Death notices 行 |
| **验收** | 失败 job 产生 `.aios/context-db/sessions/<id>/death-notices.jsonl`；status 输出 count≥1 |
| **验证** | 单测 `A3 death notice write/read/dedup`；集成：跑失败 subagent 后 `aios team status` |
| **失败表现** | worker 挂了 HUD 无信号 |

### A2 dream --to 写回 durable 记忆

| 字段 | 内容 |
|------|------|
| **目标** | dream 结果反哺 pin / AGENTS.md |
| **实现** | `dream/export-to.mjs`；CLI `--to pin\|agents\|both` |
| **验收** | preview 产出 markdown；apply 写 pin 或 AGENTS 受管块（唯一 BEGIN/END） |
| **验证** | 单测 `A2 writeAgentsDreamBlock`；手动：`aios dream --preview --to agents` 后 `aios dream --apply --to pin` |
| **失败表现** | 跨会话规划仍失忆 |

### A4 MCP description compact

| 字段 | 内容 |
|------|------|
| **目标** | tools/list 描述可压缩 |
| **实现** | `planning/mcp-compact.mjs`；`AIOS_MCP_TOOL_DESC=compact\|minimal` |
| **验收** | compact ≤160；minimal ≤80；full 不截断 |
| **验证** | 单测 `A4 compactToolDescription`；手动设 env 后 MCP tools/list |
| **失败表现** | 多 MCP 时规划上下文被工具描述占满 |

### B3 stale skill repair

| 字段 | 内容 |
|------|------|
| **目标** | 断链规划 skill 可一键修复 |
| **实现** | `plan repair-skills` → `repair-skills.mjs` |
| **验收** | 删除 broken symlink 后 re-project；`plan doctor ok` |
| **验证** | 单测 `B3 repair…`；手动：`node scripts/aios.mjs plan repair-skills --force` |
| **失败表现** | Hermes/Claude 找不到 writing-plans |

### 已完成基线（不重复实现）

| 项 | 状态 | 验证 |
|----|------|------|
| always-on 规划门控 | Done (`e14eb6e`) | plan auto-gate / hook |
| superpowers 版本安装 | Done (`a257c8e`) | superpowers doctor ≥ 6.1.0 推荐 |
| watchlist 三支柱 | Done | competitor-watchlist.json v3 |

### 本轮明确未做（下一轮）

| 项 | 原因 |
|----|------|
| B1 Plan Canvas | 体验面，依赖 plan 产物稳定 |
| B2 skill comply --live | 需 eval 预算与 sandbox agent |
| C 记忆时序/pipeline | 季度级 |

---

## 2. 推荐验证脚本（复制即用）

```bash
# G1 tests
node --test \
  scripts/tests/planning-contract.test.mjs \
  scripts/tests/competitor-iteration.test.mjs \
  scripts/tests/superpowers-version.test.mjs

# A1 manual
node scripts/aios.mjs plan auto-gate --task "verify lean inject" --json | head -c 400

# A2 manual
node scripts/aios.mjs dream --preview --to agents --json | head -c 500

# B3 manual
node scripts/aios.mjs plan repair-skills --force
node scripts/aios.mjs plan doctor --json

# Superpowers + planning
node scripts/aios.mjs internal superpowers doctor --client all
```

---

## 3. 对齐原则（如何判断「达到目标」）

1. **目标用可观测行为写**（文件存在、字符数、exit code），不用「体验更好」。  
2. **自动化测试优先**；手动命令是补充证据。  
3. **竞品映射一行**：每项标明来源竞品，避免抄错层（展示层 / 记录层不进 P0）。  
4. **完成定义 = 测试绿 + 验收表勾选 + 文档状态更新**，三者缺一不可。

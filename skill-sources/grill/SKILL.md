---
name: grill
description: "/grill <需求> — 对含糊、欠指定或可多种解读的需求做执行期内嵌澄清（rex-requirements 流程）：先查证后提问、一次只问一个决策性问题、带假设提问、3 轮澄清预算内收敛；过程中把确立的领域术语实时写入 CONTEXT.md 词汇表、把确认的决策写成 docs/adr/ 轻量 ADR。TRIGGER: /grill、grill、需求澄清、requirements clarification"

installCatalogName: grill
clients: [codex, claude, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, workflow, requirements, grilling]
repoTargets: [codex, claude, agents, workbuddy, pi, zcode, qoder]
---

# Grill（需求澄清的显式入口）

`/grill` 是 AIOS 工作流命令族中 `requirements` capability 的客户端可见入口。被调用时按序执行：

1. **声明意图**：把本轮显式声明为 `explicit-intent: grill`（或调用 MCP `aios_plan_auto_gate` 并传 `explicitIntent: "grill"`），让工作流策略按结构化 Decision 路由，不做关键词猜测。
2. **执行流程**：加载并严格遵循 `rex-requirements` 技能（用户级 `~/<home>/skills/rex-requirements/` 或仓库投影均可），包括它的全部纪律：先查后问、一次一题、带假设提问、澄清预算、验收标准与非目标记录。
3. **执行写回**：按 rex-requirements 的"写回仓库文档"步骤，把确立的领域术语实时 upsert 到 `CONTEXT.md`，把确认的决策写成 `docs/adr/NNNN-<slug>.md`。

约束：

- 本 skill 是薄入口，不复制 rex-requirements 的流程细节——两处不一致时以 rex-requirements 源（`rex-harness/skill-sources/rex-requirements/SKILL.md`）为准。
- 用户消息已带 `/grill` 前缀时不再重复声明；宿主 hook 已注入策略决定时以注入结果为准。
- 收敛后返回 rex-requirements 规定的结构化结果（`acceptance-criteria-recorded` / `assumptions-recorded` 等），不创建实施计划，不调用下一个 Provider。

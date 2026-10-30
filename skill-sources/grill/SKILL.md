---
name: grill
description: "/grill <需求> — 按决策依赖澄清需求，先查事实、一次一题，推演正常/失败路径并记录可行性依据；关键未决项阻止实施，已有决定与授权直接复用。TRIGGER: /grill、grill、需求澄清、requirements clarification"

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
2. **执行流程**：加载并严格遵循 `rex-requirements` 技能（用户级 `~/<home>/skills/rex-requirements/` 或仓库投影均可）：展开决策依赖、自己查事实、一次一题、推演正常/失败路径、记录可行性与已有对齐依据。关键未知未解决时返回 blocked，不能因问满三轮就开工。
3. **执行写回**：按 rex-requirements 的"写回仓库文档"步骤，把确立的领域术语实时 upsert 到 `CONTEXT.md`，把确认的决策写成 `docs/adr/NNNN-<slug>.md`。

约束：

- 本 skill 是薄入口，不复制 rex-requirements 的流程细节——两处不一致时以 rex-requirements 源（`rex-harness/skill-sources/rex-requirements/SKILL.md`）为准。
- 用户消息已带 `/grill` 前缀时不再重复声明；宿主 hook 已注入策略决定时以注入结果为准。
- 收敛后返回 rex-requirements 规定的结构化结果和带 `readiness` 的需求决定。`assumptions-recorded` 只记录低影响默认值，不豁免准备条件；blocked 时保留缺口，不创建实施计划、不调用下一个 Provider。已有授权可直接作为 alignment 依据，不另开批准轮次。

## 重复流程的交接

用户明确要设计重复流程，或提供已声明为 `workflow-definition` 的 loop-me 规格时，按需读取
`../aios-harness/references/workflow-integration.md` 的运行约定字段表。把触发/输入、产物与验收证据、
失败/停止、预算和人工决策写进本次已有的需求/spec；保留来源引用与版本。已有决策直接复用，
只澄清会改变执行或验收的缺口。`workflow_type: one-shot|recurring` 由模型显式声明，代码不猜意图。

完成时给出该需求产物的引用，交回当前工作流。只有宿主后续选择 planned harness 执行时才使用
`aios-harness`；设计流程本身不启动长任务、不注册定时器，也不自动接力到实施阶段。

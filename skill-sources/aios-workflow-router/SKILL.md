---
name: aios-workflow-router
description: "Route AIOS host dispositions and execute the current rex-harness software Capability Command. TRIGGER: 分析、设计、实现、调试、并发、agent team、长任务、harness、plan、工作流、多步骤"

installCatalogName: aios-workflow-router
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, workflow, routing, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# AIOS Workflow Router

这个 Skill 只协调宿主路由和 rex 返回的当前命令，不拥有软件工程步骤顺序。

## 所有权

- AIOS：`direct | guarded | planned`、最终 Provider Binding、计划和 Activation 持久化、Skill/Agent/模型执行、安全、验证、Team、Harness、恢复和重试。
- rex-harness：Observation -> Fact、Capability 选择、Capability Recipe、Evidence Contract、下一条语义 Command、软件 Workflow Recipe，以及独立可用的 rex-native Provider；宿主只能显式启用外部兼容覆盖。
- Skill / Playbook / Agent：执行已经选中的一个阶段，不根据关键词自行激活，也不决定后续阶段。

## 路由流程

1. 先读取 AIOS workflow-policy 的结构化 Decision。
2. `direct`：只读回答，不创建计划，不启动 Capability 链。
3. `guarded`：执行当前 `capabilityDecision.provider`；如果当前阶段会改文件，先执行 `pre-edit-safety-gate`。
4. `planned`：创建或复用一个 AIOS 工作项，然后仍然只执行当前 Provider。
5. Provider 完成后，把 Command 要求的 Evidence Kind 和 Artifact Ref 写回 Activation Ledger。
6. 由 rex 推进 Activation：
   - `blocked`：补齐明确列出的缺失 Evidence；
   - `next`：执行新 Command 的一个 Provider；
   - `completed`：关闭当前 Capability，并让 AIOS 自动评估下一个 Capability；
   - Promotion Request：由 AIOS 决定是否接受 Team 或 Harness 升级。

## Provider 规则

- 当前 Command 的 `provider.id` 是 `matt-*` 时，只执行对应的有边界 Skill。
- 当前 Command 的 `provider.id` 是一个 `superpowers:*` playbook 时，只执行该 playbook。
- 当前 Command 的 `provider.id` 是 `ponytail-minimize` 时，只执行最小实现阶梯，不直接实现方案。
- 当前 Command 的 Provider 是 `ecc-specialist` 时，AIOS 再按已记录的风险领域解析具体 Reviewer。

不得在首次请求中注入 `matt-requirements -> matt-test-design -> matt-implement -> matt-code-review` 整条链；每一步必须由上一阶段证据解锁。不得把 `Fast | Balanced | Deep` 作为输入路由，它们只用于总结实际 Activation。

## 宿主升级

- `team`：只有独立工作流事实成立，并且当前工作项已经是 `planned` 时使用。
- `harness`：只有连续性、恢复或长运行事实成立，并且当前工作项已经是 `planned` 时使用。
- 没有真实并行域时保持顺序执行；没有可恢复目标时不启动 Harness。

## 完成门

改动行为后必须执行 `verification-before-completion` 或当前客户端暴露的等价验证 Skill。只有测试、类型检查、Review 和 Evidence Contract 都有具体引用时，才能声称完成。

## 资源

- `rex-harness/docs/architecture.md`
- `rex-harness/docs/capability-lifecycle.md`
- `rex-harness/docs/workflow-ownership.md`
- `.aios/workflow-activations/`
- `docs/plans/`

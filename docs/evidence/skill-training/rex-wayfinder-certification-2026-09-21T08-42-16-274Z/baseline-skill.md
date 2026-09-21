---
name: rex-wayfinder
description: Use only after rex-harness selects decision wayfinding and supplies the current Command.
---

# Rex Wayfinder

仅在 rex-harness 已经激活路径探索 Capability，并提供当前 Command 后执行本流程。

1. 写清已知目的地、成功信号和范围边界。
2. 把未知路径拆成会改变下一步的决定问题，并记录它们之间的依赖关系。
3. 每次只用仓库证据解决一个决定；把事实、推断和仍未知内容分开记录。
4. 一旦出现一个可执行、可验证的下一切片就停止，不继续扩写完整计划。

返回 `destination-recorded`、`decision-map-recorded` 和 `next-slice-identified`，每项都必须附带真实的文档、代码或决定引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

### Artifact contract

完成态必须返回一个 `rex.wayfinding-artifact.v1`，只允许以下边界：

- `destination`：目的地、成功信号、范围和 evidence refs；
- `decisionGraph`：有稳定 id 的节点和边，边不得引用未知节点；
- `unknowns`：仍未知的问题、影响和 evidence refs；
- `decisionTicket`：稳定的 `decision-*` id、事实、决定、后果和 evidence refs；
- `nextSlice`：恰好一个可执行切片，包含 outcome、verification 和 evidence refs。

如果没有真实决定，必须返回 `status: partial` 或 `status: blocked`，且不得同时声称 `decisionTicket` 或 `nextSlice` 已完成。不要输出 TODO、TBD、placeholder、第二份实施计划或 tracker/assignee/child issue。

普通已知计划不使用本能力，也不要在本能力内继续实施或调用下一个 Provider。

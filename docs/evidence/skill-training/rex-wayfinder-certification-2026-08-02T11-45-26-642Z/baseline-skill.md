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

普通已知计划不使用本能力，也不要在本能力内继续实施或调用下一个 Provider。

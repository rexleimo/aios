---
title: "v5.5.1：基于证据的 Agent 生命周期晋级"
description: "v5.5.1 移除了 Agent 晋级的硬编码瓶颈：默认覆盖全部 canonical roles，完整 managed evidence 通过后即可进入 live workflow。"
date: 2026-08-08
tags: ["Harness CLI", "agents", "smoke", "workflow", "release"]
---

# v5.5.1：基于证据的 Agent 生命周期晋级

v5.5.0 引入了 Agent live smoke evidence，但 catalogue 仍然使用六个 Agent 的硬编码晋级名单。结果是：某个 Agent 即使已经拥有有效的 smoke、provenance 和双向 metrics evidence，仍然可能被标记为 candidate 并阻塞 live workflow。

## v5.5.1 改了什么

- `agents smoke` 默认覆盖全部 19 个 canonical Agent roles，包括文档、React、重构和 TypeScript 专项角色。
- 完整的 managed evidence 通过后，任意 canonical Agent 都可以晋级为 `projected`。
- 无效或不完整的 evidence 仍然 fail-closed。
- status 现在区分 Agent blocker 和 quality-gate blocker。
- macOS `/var` 与 `/private/var` 路径别名在 projection contract test 中统一 canonicalize。

## 验证

v5.5.1 使用 Codex 对全部 19 个 canonical Agent 完成 smoke，全部通过。Rex workflow policy 74/74，Rex integration 52/52，完整根测试 1023 项通过、10 项设计内 skip、0 项失败。

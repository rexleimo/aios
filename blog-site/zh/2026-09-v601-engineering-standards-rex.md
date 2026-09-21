---
title: "v6.0.1：工程标准移入 rex-harness——基线搬去和消费者同住"
description: "v6.0.1 把工程标准技能从宿主搬进 rex-harness 子模块，改名 rex-engineering-standards（rex-harness 0.7.0）：能力链的共同质量基线现在随能力链发布，独立使用 rex-harness 的消费者也不再错过它。"
date: 2026-09-21
tags: ["AIOS", "工程标准", "rex-harness", "架构", "release", "v6.0.1"]
---

# v6.0.1：工程标准移入 rex-harness——基线搬去和消费者同住

> **Quick Answer：** v6.0.0 把工程标准作为宿主技能 `aios-engineering-standards` 发布。这把依赖方向放反了：消费标准的四个 Provider（`rex-implement`、`rex-refactor-hardening`、`rex-code-review`、`rex-design`）全在 `rex-harness` 子模块里，而 rex-harness 本身是独立发布到 npm 的控制平面。v6.0.1 一步纠正：技能改以 `rex-engineering-standards` 随 `rex-harness` 0.7.0 发布，digest 已登记进投影历史。内容与 Definition of Done 不变；router 与 `pre-edit-safety-gate` 改用新名字。

## 为什么搬

两个事实让最初的落位是错的：

1. **消费者在子模块里。** 每个代码生产类 Provider 执行前都要读这份标准。读者都在一个仓库、标准本身却在另一个仓库，是倒置的依赖——引擎引用宿主的目录。
2. **rex-harness 是独立的。** `@rexleimo/rex-harness` 发布到 npm，`files` 包含 `skill-sources/`，自我描述是独立的证据驱动工作流控制平面。只用 rex、不装 AIOS 宿管的消费者，会面对四个引用着不存在技能的 Provider——质量基线在 AIOS 之外静默消失。

标准此后还会随能力链（证据契约、Provider 步骤、门禁）持续演化。同仓 = 一个仓库、一条 changelog、一个版本故事。

## 改了什么

- 技能改从 `rex-harness/skill-sources/rex-engineering-standards/` 发布（rex-harness 0.7.0），digest 登记进 `src/clients/projection-history.json`，客户端投影平滑升级。
- 宿主技能目录回到 27 个；rex 投影增至 14 个。
- `aios-workflow-router` 与 `pre-edit-safety-gate` 加载并引用 `rex-engineering-standards`——与 router 引用 `rex-*` Provider 相同的按名模式。
- 标准本身——边界、深层模块、代码基线、测试基线、工具链基线、ADD、Definition of Done——一字未动。

## 没改什么

v6.0.0 交付的用户面全部保持：router 仍在任何代码生产类 Provider 之前加载标准，完成仍要求 Provider 证据契约**且** Definition of Done，依然没有"跳过质量"路线。公开的[工程标准页](/zh/engineering-standards/)及参考文案除技能名外无变化。

## 升级

运行 `aios update`（或 `aios init --all`）重新投影技能；新的 `rex-engineering-standards` 会自动替换旧的宿主投影。无需配置，也无法绕过。

## 参见

- [v6.0.0：工程标准内建——AIOS 构建软件，而不只是生成代码](/blog/zh/2026-09-v600-engineering-standards/)
- [工程标准文档](/zh/engineering-standards/)

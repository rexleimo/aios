---
title: "v3.20 Harness 可靠性升级：失败分类、退避上限与 dry-run 就绪度"
description: "了解 Harness CLI v3.20 如何区分业务失败与基础设施失败，并用有上限的退避和 dry-run readiness 改善长任务稳定性。"
date: 2026-07-12
tags: ["Harness CLI", "可靠性", "solo harness", "失败处理", "release"]
---

# v3.20 Harness 可靠性升级：失败分类、退避上限与 dry-run 就绪度

> **快速答案：** v3.20 把“这次尝试失败了”和“基础设施暂时不可用”分开统计。`consecutiveFailures` 记录所有非成功 outcome，`consecutiveInfraFailures` 只记录基础设施重试和运行时/工具错误；退避时间有 300 秒上限，dry-run 也会单独报告配置是否就绪、provider 是否真的可用。

长任务最难处理的不是第一次失败，而是失败之后系统是否还能解释自己的状态。只显示“重试中”会让用户不知道是任务本身有问题，还是模型、工具或网络暂时不可用。v3.20 的可靠性改进围绕可观测的失败语义展开。

## 两个计数器解决什么问题？

### `consecutiveFailures`

这个计数器记录连续的所有非成功结果，包括 blocked、failed、infra-retry 和 human-gate。它回答的是：当前目标连续多少次没有完成？

### `consecutiveInfraFailures`

这个计数器只记录 infra-retry，以及 runtime-error/tool-error 等基础设施类故障。它回答的是：系统是否连续遇到了应该重试的运行环境问题？

两个数字不能互相替代。一个被人工门禁阻塞的任务和一个浏览器进程崩溃的任务，都可能增加总失败次数，但恢复动作不同。

## 为什么退避必须有上限？

重试需要给外部 provider、浏览器或工具留出恢复时间，但无上限退避会让一个暂时性问题变成用户无法判断的长时间等待。v3.20 将退避封顶为 300 秒，形成更可预测的节奏：

1. 记录当前 outcome 和失败类型。
2. 对可以恢复的基础设施失败进行退避。
3. 不让等待时间超过 300 秒。
4. 在达到停止条件或需要人工处理时，明确报告原因。

这不是让所有错误都自动重试。业务失败、blocked 和 human-gate 仍然需要不同的下一步。

## dry-run readiness 不是“命令能跑”

另一个重要变化是把 dry-run 的结果拆开。一个任务可以通过输入和配置校验，但仍然缺少可用 provider、登录浏览器或人工授权。因此状态应该至少区分：

- 输入和配置格式正确；
- 本地运行时检查通过；
- 外部依赖可连接；
- 需要人工批准或仍被阻塞。

这让 CI、solo harness 和团队交接都更容易判断下一步，也避免把 dry-run 的绿灯写成 live execution 已成功。

## 什么时候应该使用这些信息？

如果你在运行可恢复的长任务，优先看失败分类和最近一次 outcome，再决定是等待、修复输入、重新登录还是请求人工处理。不要只依据重试次数判断任务健康度。

配合[故障排查文档](https://cli.rexai.top/zh/troubleshooting/)和[Solo Harness 指南](https://cli.rexai.top/zh/solo-harness/)使用，可以把一次失败变成交接信息，而不是一条孤立日志。[架构文档](https://cli.rexai.top/zh/architecture/)则解释了运行时状态和项目上下文的边界。

## 常见问题

### 所有失败都会计入 `consecutiveInfraFailures` 吗？

不会。它只针对基础设施重试和运行时/工具错误；blocked、业务失败和 human-gate 只会影响总失败计数或相应状态。

### 300 秒后系统一定会停止吗？

不一定。300 秒是单次退避的上限，不是所有任务的总时限。是否继续还取决于 outcome、停止条件和人工门禁。

### dry-run 通过后可以跳过 live 检查吗？

不可以。dry-run 证明的是配置和输入在本地检查中可接受，不证明外部 provider、浏览器会话或账号已经可用。

### 这次升级影响业务逻辑吗？

它主要改善 harness 的状态表达、重试节奏和 readiness 报告。业务任务仍应根据实际 outcome 和人工要求决定下一步。

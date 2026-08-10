---
title: "v5.4.4：Agent 冒烟检测可靠性——输出契约客户端与超时自动升级"
description: "v5.4.4 修复了 Agent 卡在'command 无效 / workflow 卡死'状态的问题：live smoke 现在兼容 Codex 等输出契约客户端，硬编码的 30 秒探测超时改为可配置（默认 60 秒），探测遇到超时会按 2x/4x 自动升级重试，不再一次超时就把 Agent 永久判死。"
date: 2026-08-06
tags: ["AIOS", "agents", "smoke", "timeout", "reliability", "release"]
---

# v5.4.4：Agent 冒烟检测可靠性——输出契约客户端与超时自动升级

> **快速结论：** v5.4.4 修复了 "command 无效 / workflow 卡死" 这一故障模式。此前 Agent 会因为与自身毫无关系的原因被永久禁用：Codex 这类客户端会把每个回复都包进 JSON 输出契约（探测看不到自己的 ACK），而硬编码的 30 秒超时把一次慢冷启动变成了永久封锁。现在探测 prompt 显式覆写输出契约、ACK 检测兼容 JSON 包裹、超时可配置（默认 60 秒，`AIOS_AGENT_SMOKE_TIMEOUT_MS` 或 `--timeout-ms`），并在判定 blocked 之前按 2x/4x 自动升级重试。

## 故障模式：静默死掉的 workflow

一个 workflow 突然报 `overallstatus: "blocked"`，所有命令都被判"无效"。根因链比看起来长：

1. live smoke 探测是守门员——Agent 必须先有 smoke 证据才能参与实时编排。
2. 探测失败 → 不写证据 → Agent 保持 workflow 禁用。
3. 禁用 Agent → `strict.blocked` → 每个 Command 都被判无效。

两个独立 bug 让健康 Agent 也过不了探测：

**Bug 1——输出契约陷阱。** 有些客户端（最常见是 Codex）把*每一个*响应都包进 JSON handoff 契约，哪怕探测明确说"只回 ACK"。探测找明文 ACK 标记，在 JSON 壳里永远找不到，于是报失败。更糟的是：客户端越严格地遵守自己的契约，探测就失败得越稳定——协议死锁。

**Bug 2——一次慢响应 = 永久封锁。** 探测是硬编码 30 秒、无重试。一次慢冷启动或模型排队把探测拖过 30 秒，Agent 被封锁，没有任何重试——恢复只能靠一个恰好知道 `--timeout-ms` 的人手动重跑。

## v5.4.4 改了什么

### smoke 兼容输出契约客户端

- 探测 prompt 现在显式声明 "Do NOT return a JSON handoff object — reply with the ACK marker only"，在探测场景覆写客户端输出契约。
- ACK 检测兼容 JSON 包裹：找不到明文标记时，把回复按 JSON 解析后在包裹内部搜索。
- post-receive 压缩证明只对达到 `minRawBytes`（2048 字节）的输出生效。短输出按设计内联——这是合法边界行为，不是 smoke 失败。
- 空压缩 refs 不再导致证据记录崩溃（`refs[0]` 改为可选链）。

### 超时自动升级，不再一次判死

- 硬编码 30 秒替换为 `AIOS_AGENT_SMOKE_TIMEOUT_MS`（环境变量）和 `agents smoke --timeout-ms <ms>`（CLI），默认提升到 60 秒。
- 遇到瞬时慢响应，探测自动按 **60s → 120s → 240s** 升级重试。三次全部超时才判定 blocked。
- 最终 blocker 信息自带恢复命令，解除封锁不再需要猜。

### 为什么不让 Agent 自己调大超时？

一个自然的问题：为什么不让 Agent"多想一会儿"、自己给自己加时间？因为它做不到，也不该做。超时是宿主侧的进程参数——Agent 进程根本看不到；让被测试者给自己打分，得到的只会是"自证合格"的假通过。预算属于操作者，他才知道客户端的冷启动习性；宿主侧自动升级才是正确姿势。

真实任务执行完全是另一套预算：子代理任务走 `SUBAGENT_TIMEOUT_MS`（默认 10 分钟）。30 秒/60 秒的探测超时从来没限制过真实工作——它只守护连通性握手。

## 你应该做什么

- 已安装用户：`aios update`。
- 之前遇到过 "command 无效 / workflow 卡死"：重跑 `aios agents smoke --live --client <名字> --timeout-ms <ms>` 重新生成 v2 smoke 证据，再用 `aios doctor --agents` 确认目录全绿。
- 客户端冷启动特别慢：在环境里设 `AIOS_AGENT_SMOKE_TIMEOUT_MS`，不用每次传 flag。

## FAQ

### 这样会不会放过真正坏掉的 Agent？

不会。长输出缺压缩 ref 仍然 fail-closed；非超时错误（命令缺失、非零退出、缺 managed-invocation 证明）一律不重试、立即 blocked。只有超时类失败才享受 2x/4x 升级，而且总共只有三次。

### 60 秒 × 3 次对探测来说会不会太长？

升级只在真的超时后才触发。健康客户端几秒内就应答——第一次尝试就成功，根本不会重试。240 秒的最坏情况只由那些 60–120 秒内确实答不完的客户端承担。

### 需要迁移数据吗？

不需要。这是行为修复，证据文件 schema 不变。如果 Agent 当前处于 blocked，重跑一次 live smoke 重新生成 v2 证据即可。

这条经验值得记住：一个把"一次慢响应"当"一次失败"来惩罚的守门员，是时钟而不是健康检查。先升级、再重试、最后才审判。

---
title: "Browser MCP 弱模型升级：语义快照 + 文本点击"
description: "本次迭代通过紧凑页面语义工具、文本优先点击动作与真实 CDP 兼容性修复，提升弱模型在浏览器任务中的完成率。文章给出改动前后的对比数据、仍然会失败的边界场景，以及判断是否值得切换的依据。文中给出在弱模型上复现这些改进的最小测试步骤与预期结果。"
date: 2026-04-18
tags: [Browser MCP, 弱模型, Agent Runtime, AIOS, 稳定性]
---

# Browser MCP 弱模型升级：语义快照 + 文本点击

这次迭代的核心目标很直接：**让能力较弱的规划/编码模型在浏览器任务里更稳定地完成工作**，同时不影响强模型路径。

目标对象包括部分低能力规划模型（例如一些 GLM/minmax/Ollama 组合），它们常在复杂页面、严格定位器约束和长链路操作上失败。

## 问题概览

更新前，弱模型主要在三处失效：

- 页面文本/HTML 噪声太大，无法稳定决定下一步动作。
- 低级定位器构造与唯一性消歧能力不足。
- 单测通过但真实 CDP 会话 `evaluate` 兼容性不一致，运行时脆弱。

## 本次交付

### 1）强化原生提示中的浏览器操作范式

默认 SOP 强化为：

- `read -> act -> verify` 短循环
- 单步执行（禁止盲链式多动作）
- 密集/动态页面优先 `semantic_snapshot`
- 标签明确时优先 `click_text`

这在提示词与流程层面提升了弱模型稳定性。

### 2）新增弱模型友好的 MCP 原语

在 browser-use 运行时新增两个高层工具：

- `page.semantic_snapshot`
  - 返回紧凑语义结构（`title`、`url`、标题、可操作项、截断状态）
  - 相比全量 HTML 显著降低决策熵
- `page.click_text`
  - 文本优先点击，支持 `exact`、`nth`、`timeout_ms`
  - 减少手写 selector 的负担

### 3）基于真实 CDP 冒烟的运行时加固

首轮真实浏览器冒烟暴露了单测未覆盖的问题，已修复：

- locator evaluate 契约（`arguments[0]` -> 显式函数参数）
- semantic snapshot 结果归一化（兼容字符串化对象）
- `page.goto` URL 回读兜底（`get_url` -> `location.href`）
- 文本点击候选收敛（优先可交互元素 + selector 去重）

## 验证结果

### 自动化

- `mcp-browser-use` 执行 `pytest -q`：**15 passed**

### 真实 CDP 冒烟（修复后）

流程：

1. `browser.connect_cdp`
2. `page.goto("https://example.com")`
3. `page.wait(text="Example Domain")`
4. `page.semantic_snapshot(max_items=8)`
5. `page.click_text("Learn more")`
6. `browser.close`

结果：真实运行时全链路成功。

## 为什么这对弱模型有效

这次更新本质上是**降低决策复杂度**：

- 用紧凑语义输入替代高噪声 DOM
- 用文本动作替代脆弱 selector 拼装
- 加强回读与歧义处理，减少失败级联

强模型能力保持完整，不受这组增强限制。

## 下一步

后续计划：

- 提升 `NOT_UNIQUE` 错误提示（返回更可执行的消歧线索）
- 增加模型分层提示预设（weak/medium/strong）
- 建立弱模型浏览器基准集，纳入回归门禁


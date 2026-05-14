---
title: "自研 Token 压缩：为什么 RexCLI 不安装 RTK 或 Caveman"
date: 2026-05-12
tags: ["AIOS", "token compression", "ContextDB", "skills", "RexCLI"]
description: "RexCLI 现在原生实现省 token：ContextDB 输入压缩、浏览器紧凑读取、CLI 范围化输出，以及无需竞品依赖的输出压缩技能。"
---

# 自研 Token 压缩：为什么 RexCLI 不安装 RTK 或 Caveman

Token 成本不只是账单问题，也是稳定性问题。

长时间 AI 编程任务最容易被噪声拖垮：完整日志、重复堆栈、页面样板内容、冗长状态更新。最省事的做法是直接安装一个竞品 token 工具，但 RexCLI 不这么做。

我们只参考 RTK 风格的输入过滤和 Caveman 风格的输出简写，把能力实现到 AIOS 自己的工作流里。

## 改了什么

RexCLI 现在把省 token 拆成两层原生能力：

1. **输入压缩**：命令、浏览器、ContextDB 内容进入模型前先降噪。
2. **输出压缩**：Agent 回答更短，但不丢命令、路径、错误、风险提示。

不安装 RTK。不安装 Caveman。不加会全局改写命令的 shell hook。

## 原生输入压缩

ContextDB 已经有自研 token 策略引擎：

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

默认策略偏保守：

- 压缩重复行和堆栈噪声；
- 保留关键错误、文件路径、命令和最新状态；
- 先丢低优先级事件，再截断受保护事件；
- 输出 `strategy`、`rawTokenUsed`、`compressed`、`dropped`、`truncated` 等遥测信息。

浏览器任务里，新的 `aios-browser-compress` 技能会优先使用更紧凑的读取方式：

1. `page.semantic_snapshot`
2. 定向 `page.extract_text`
3. 全页 `page.extract_text`
4. `page.get_html`
5. 只有需要视觉证据时才截图

CLI 任务里，RexCLI 鼓励范围化输出：`rg`、`git diff --stat`、`sed -n`、`head`、`tail` 和定向测试。

## 原生输出压缩

新的 `aios-compress` 技能定义三档回复：

| 档位 | 使用场景 | 行为 |
|------|----------|------|
| `tight` | 日常编码 | 短技术回答，无废话 |
| `ultra` | harness 日志、checkpoint | 一行证据 + 下一步 |
| `precise` | 浏览器操作、安全、不可逆动作 | 完整明确表达 |

核心原则：压缩不能隐藏风险。错误、命令、路径、选择器、日期和验证缺口必须保留精确表达。

## 为什么不安装竞品工具？

直接安装另一个 token 工具看起来很快，但会引入隐藏耦合：

- 命令行为可能在 RexCLI 控制之外改变；
- Codex、Claude、Gemini、opencode 的表现难以一致；
- 文档更难验证；
- 用户多一个依赖、升级路径和故障模式。

原生实现让行为可审计。代码、技能、文档都在仓库里。

## 怎么用

ContextDB 包：

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

Agent 输出：

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

浏览器自动化优先用语义快照和定向抽取，再考虑全页文本。

## 结论

RexCLI 的省 token 现在是原生能力：ContextDB 和浏览器工作流负责输入压缩，AIOS skill 负责输出压缩，并且没有竞品安装步骤。

这样长任务更省、更安静，也更容易验证。

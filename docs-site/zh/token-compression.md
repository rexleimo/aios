---
title: Token 智能与压缩
description: 用 RTK、Caveman、Headroom MCP、ContextDB 和 Ponytail 启发的决策门禁，减少无用上下文并保留实现判断所需的证据。
---

# Token 智能与压缩

## 快速答案

真正有价值的省 token 不是把文字硬缩短，而是在不丢失错误、路径、决策和验证证据的前提下，让 Agent 不必反复阅读无用上下文。v3.6.0 把这件事分成五层处理。

## 五层职责

| 层 | 职责 | 不承诺什么 |
| --- | --- | --- |
| Ponytail 启发的门禁 | 在实现前选择最小正确方案，避免无谓代码、依赖和文件。 | 这是一条 AIOS 工作流规则，不等于已安装 Ponytail 官方插件。 |
| RTK | 压缩进入 Agent 的 shell 和工具输出噪音。 | 不替代精确命令，也不保证保留所有原始日志行。 |
| Headroom MCP | 让 MCP 客户端按需压缩后续步骤还会使用的大段材料。 | 不是当前模型请求的透明拦截。 |
| Caveman | 在不删技术事实的前提下压缩 Agent 回复表达。 | 不会独立压缩工具输出或文件。 |
| ContextDB | 按需召回项目上下文，而不是每轮塞入全部历史。 | 不会自动把全部运行时历史注入每个 prompt。 |

规划、测试、CRG 证据、隐私检查和最终验证仍然是独立的质量门禁；压缩层不能替代它们。

## 安装与预览

统一入口是 `aios init`：

```bash
# 只预览，不下载包，也不改客户端配置。
node scripts/aios.mjs init --all --dry-run

# 交互式安装：检测并安装 RTK、Caveman 与支持范围内的 Headroom。
node scripts/aios.mjs init --all

# CI/无人值守安装。
node scripts/aios.mjs init --all --yes-compression-tools

# 同时授权 Gemini/Grok 写入新的用户级 Headroom MCP 注册。
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

Headroom 需要 Python 3.10 或更高版本，以及 `uv` 或 `pipx`。AIOS 安装经过测试的隔离工具版本 `headroom-ai[all]>=0.31.0,<0.32.0`，不会静默改写系统 Python 环境。

`--yes-compression-tools` 只授权无人值守下载安装；`--yes-headroom-mcp` 单独授权修改客户端用户级配置。两者刻意分开，避免把“同意安装”扩大成“同意改配置”。

## RTK、Caveman 与 ContextDB

RTK 是本地命令输出层。即使启用了它，仍然应优先使用小范围命令，避免把无关内容送入上下文：

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

Caveman 是本地 prompt skill，用来减少回复里的填充词。命令、路径、错误、日期、决策、风险和验证缺口必须保留；需要详细说明时应回到普通表达。

ContextDB 仍按需打包和召回上下文：

```bash
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

## Headroom：MCP 是显式按需，不是透明托管

Headroom 上游为部分客户端提供官方 `wrap`。被 wrap 的客户端可以使用 Headroom 自己的代理和生命周期；但 **AIOS v3.6.0 不宣称 `aios init` 会自动托管或 wrap 所有客户端启动**。安装 Headroom 与注册 MCP 是两件不同的事。

对本集成中没有上游 wrap target 的客户端，AIOS 调用客户端自己的官方 MCP 命令，注册官方 `headroom mcp serve`：

| 客户端 | v3.6.0 路径 | 条件 |
| --- | --- | --- |
| Gemini CLI | 用户级官方 MCP 注册 | 需要单独的 MCP 授权。 |
| Grok Build | 用户级官方 MCP 注册 | 需要单独的 MCP 授权。 |
| Hermes Agent | 用户级官方 MCP 注册 | 必须在真实 TTY 内完成；无 TTY 时会报告 `pending-interactive`。 |

MCP server 暴露 `headroom_compress`、`headroom_retrieve` 和 `headroom_stats`。模型需要**显式**调用它们。通常模型已经看过原文后才请求压缩，因此当前 turn 未必省 token，甚至可能多一次工具调用；收益主要是后续步骤只保留压缩结果，需要时再按引用取回原文。

AIOS 只记录自己创建的注册，ledger 位于 `~/.aios/integrations/headroom-mcp.json`。如果已有同名条目来自用户或与预期指纹不一致，状态会是 `external` 或 `conflict`，安装器不会覆盖它。

## Ponytail 启发的决策顺序

在新增代码、依赖、文件或大段上下文前，先按 [Ponytail](https://github.com/DietrichGebert/ponytail) 启发的顺序判断：

1. 能否用解释、配置或更小的编辑解决？
2. 是否已有函数、文档或工具可复用？
3. 能否用定向查询替代全仓库、全网页或整份日志读取？
4. 只有前面都不够时，才做最小、可测试的实现。

浏览器任务也遵循同一原则：`page.semantic_snapshot` -> 定向 `page.extract_text` -> 全文 -> HTML；只有需要视觉证据时才截图。

## 隐私与度量边界

- RTK 和 Caveman 都在本地运行。安装 Headroom 可能访问包仓库和可选模型资源。
- Headroom wrapper 或正常客户端仍会把模型请求发送到用户配置的模型服务商；本地压缩不等于模型服务商流量消失。
- 上游宣传的节省比例只是上游基准，不是 AIOS 本地实测。只有 `headroom_stats` 同时显示压缩次数和正的 token 节省时，才能声称 MCP 有实际节省。

## 延伸阅读

- [v3.6.0 更新日志](changelog.md)
- [Headroom + Ponytail 工作流说明](https://cli.rexai.top/blog/zh/2026-07-headroom-token-intelligence/)
- [ContextDB](contextdb.md)
- [Ponytail 上游项目](https://github.com/DietrichGebert/ponytail)

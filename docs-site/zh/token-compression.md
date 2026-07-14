---
title: Token Intelligence 与压缩边界
description: 使用 RTK、Caveman、Headroom MCP、ContextDB 和 Ponytail 启发的决策门，保持上下文有效而不夸大能力。
---

# Token Intelligence 与压缩

## 一句话回答

上下文效率不是一个压缩开关，而是一套工作流。Harness CLI 将最小正确改动门、RTK shell 输出过滤、Caveman 响应风格、显式 Headroom MCP 工具和 pull-based ContextDB 召回分开。每层职责不同，任何一层都不能替代测试、隐私检查或最终验证。

## 现在就做

先预览当前安装边界，再选择需要的授权：

~~~bash
node scripts/aios.mjs init --all --dry-run
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
aios doctor --native --verbose
~~~

Headroom 需要 Python 3.10 或更高版本，以及 uv 或 pipx。AIOS 会在隔离工具环境中安装经过测试的 headroom-ai[all]>=0.31.0,<0.32.0。

## 五层职责

| 层 | 职责 | 边界 |
| --- | --- | --- |
| Ponytail 启发的决策门 | 在新增工作前优先考虑解释、配置或更小改动 | 工作流指引，不是安装的 Ponytail 插件 |
| RTK | 在 Agent 读取前过滤本地 shell 和工具输出噪声 | 不替代定向命令，也不保留每一行原始日志 |
| Caveman | 保留技术事实的简洁响应风格 | 不压缩文件或工具 |
| Headroom MCP | 显式压缩和取回后续步骤仍需的材料 | 不是当前模型请求的透明拦截 |
| ContextDB | 按需召回项目上下文，而不是注入全部历史 | 不会自动让运行时历史出现在每个 prompt |

规划、代码审查、隐私、测试和验证仍是独立门禁。

## RTK 和 Caveman

RTK 是本地命令输出层。即使启用，也应限制命令范围，让路径和失败信息可见：

~~~bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
~~~

Caveman 是本地 prompt skill，用于简洁状态和检查点。必须保留命令、路径、错误、日期、决策、风险和未完成验证。需要详细解释时应使用普通表达。

## Headroom MCP 是显式路径

Headroom 上游为部分客户端提供官方 wrap target。AIOS v3.6.0 不声称 aios init 会自动包装每个客户端启动。安装和 MCP 注册是两个操作。

| 客户端 | 路径 | 条件 |
| --- | --- | --- |
| Gemini CLI | 用户级官方 MCP 注册 | 需要单独 MCP 授权 |
| Grok Build | 用户级官方 MCP 注册 | 需要单独 MCP 授权 |
| Hermes Agent | 用户级官方 MCP 注册 | 需要真实 TTY；否则为 pending-interactive |

服务器提供 headroom_compress、headroom_retrieve 和 headroom_stats，由模型显式调用。模型可能在压缩前已经看过原文，因此当前 turn 可能多一次工具调用；主要收益是后续步骤保留紧凑结果，需要时按引用取回原文。

AIOS 将自己拥有的注册记录在 ~/.aios/integrations/headroom-mcp.json。已有 external 或 conflict 条目会被报告，不会覆盖。

## ContextDB 上下文包

需要有限范围的会话交接时：

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

balanced 保留最近工作和失败信号；aggressive 使用更小细节预算；legacy 为兼容保留历史尾部。详见 [ContextDB](contextdb.md)。

## 决策顺序

新增代码、依赖、文件或大段上下文前：

1. 能否用解释或配置变化解决？
2. 是否已有函数、文档或工具可以复用？
3. 能否用定向查询替代读取整个仓库、页面或日志？
4. 如果仍不够，再做最小且有测试的实现。

浏览器任务先读取 semantic_snapshot 或定向 extract_text，需要时再扩大范围。

## 这套系统不承诺什么

- 没有本地测量，就没有通用 token 节省百分比。
- 不会透明拦截每个模型请求。
- 不保证模型供应商流量消失。
- 不保证自动包装每个受支持客户端。
- 不允许丢弃错误、路径、决策或验证证据。
- 不替代 ContextDB 搜索、测试、隐私审查和最终验证。

## 常见问题

### 需要安装所有层吗？

不需要。先运行 aios init --all 并检查 dry run，只安装符合工作流的包和客户端集成。

### Headroom 和 RTK 一样吗？

不一样。RTK 在 Agent 读取前过滤本地命令输出；Headroom 是后续步骤显式调用的 MCP 工具路径；Caveman 只改变响应风格。

### 如何测量 Headroom 的真实收益？

使用 headroom_stats，并确认同时存在压缩事件和正的 saved-token 总量。上游 benchmark 百分比不是本地 AIOS 证据。

### 没有这些工具还能用 ContextDB 吗？

可以。ContextDB 的记忆、memo、搜索和检查点与 RTK、Caveman、Headroom 相互独立。

## 下一步

- [快速开始](getting-started.md) - 初始化并验证。
- [ContextDB](contextdb.md) - pull-based 记忆和统一搜索。
- [工作流策略](workflow-policy.md) - 选择更小、更安全的路径。
- [Headroom + Ponytail 工作流说明](https://cli.rexai.top/blog/zh/2026-07-headroom-token-intelligence/)

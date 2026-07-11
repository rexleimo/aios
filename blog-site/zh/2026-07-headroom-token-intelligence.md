---
title: "v3.6.0：用 Headroom 与 Ponytail 构建更稳的 Token 智能工作流"
description: "Harness CLI 将 RTK、Caveman、Headroom MCP、ContextDB 与 Ponytail 启发的决策门禁组合起来，同时明确客户端配置的所有权边界。"
date: 2026-07-10
tags: ["AIOS", "Headroom", "Ponytail", "RTK", "Caveman", "MCP", "Token 压缩"]
---

# v3.6.0：用 Headroom 与 Ponytail 构建更稳的 Token 智能工作流

省 token 不能靠删掉 Agent 做判断所需的证据。v3.6.0 增加了这套五层工作流的安装与兼容控制面：先避免无效工作，再压缩输入噪音，让跨步骤的大材料可以按需保留，收紧表达，并且只在需要时召回历史。

## 五层各司其职

| 层 | 职责 |
| --- | --- |
| Ponytail 启发的门禁 | 在新增代码、依赖、文件或大段上下文前，先选最小正确方案。 |
| RTK | 在本地降低 shell 与工具输出噪音。 |
| Headroom | 为后续 MCP 步骤保存和召回大材料的紧凑表示。 |
| Caveman | 不删技术事实地压缩 Agent 回复。 |
| ContextDB | 让项目历史按需拉取，而不是全部自动注入。 |

决策门禁受 [Ponytail](https://github.com/DietrichGebert/ponytail) 启发，并保留来源和许可边界。AIOS 不宣称安装或复刻了上游插件。规划、测试、代码审查、隐私检查和验证仍是独立质量门禁。

## 为什么不向所有 shell 强塞 Headroom

Headroom 上游 CLI 对部分客户端提供官方 `wrap`。wrap 自己负责代理、provider 配置和清理生命周期。如果在 shell 层假装所有客户端都已经 wrap，不仅脆弱，也可能与已有客户端配置冲突。

因此 v3.6.0 把集成边界收紧为可验证的几件事：

- `aios init` 在隔离工具环境中检测并安装经过测试范围的 Headroom。
- Gemini CLI、Grok Build 与 Hermes Agent 使用各自的官方 MCP 命令，注册官方 `headroom mcp serve`。
- AIOS 使用绝对 Headroom 可执行路径，重新读取注册结果，并只在 `~/.aios/integrations/headroom-mcp.json` 中记录 AIOS 自己创建的条目。
- 已有外部条目或指纹不一致的条目会报告为 `external` 或 `conflict`，绝不覆盖。

Hermes 需要真实 TTY 来完成宿主 CLI 的工具启用交互。非交互 init 会报告 `pending-interactive`，不会伪造成功。

## MCP 是显式按需压缩，不是透明拦截

这是最重要的边界：`headroom_compress`、`headroom_retrieve` 和 `headroom_stats` 是模型显式调用的 MCP 工具。模型通常已经看过原文才请求压缩，所以当前 turn 未必省 token，甚至可能多一次工具调用。

真正的收益在后续步骤：只保留紧凑结果，需要时才取回原文，并通过统计确认实际工作。只有统计同时显示成功压缩次数和正的 saved-token 总数时，才把 MCP 节省描述为实测；上游宣传比例不是 AIOS 本地证据。

## 一个安装流程，两份独立授权

```bash
# 只检查，不下载包，也不修改客户端配置。
node scripts/aios.mjs init --all --dry-run

# 交互式安装 RTK、Caveman 与支持范围内的 Headroom。
node scripts/aios.mjs init --all

# 无人值守安装。
node scripts/aios.mjs init --all --yes-compression-tools

# 另行授权 Gemini/Grok 写入 MCP 注册。
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

两个无人值守 flag 刻意分开：同意安装本地包，不等于同意改用户的 MCP 配置。Headroom 需要 Python 3.10+ 与 `uv` 或 `pipx`；AIOS 使用 `headroom-ai[all]>=0.31.0,<0.32.0` 这个测试范围，不会静默安装到系统 Python。

## 一条实用的决策顺序

准备读完整仓库、网页或日志，或者准备新增实现前，先问：

1. 能否用更小的编辑、配置或解释解决？
2. 是否已有实现或文档可复用？
3. 能否用定向查询获得所需证据？
4. 前面都不够时，再做最小的、已测试的改动。

这比单纯压缩措辞省得更多，因为它先阻止低价值上下文和低价值实现产生。

## 隐私边界

RTK 与 Caveman 在本地运行。安装 Headroom 可能访问包仓库和可选模型资源。Headroom wrapper 或普通客户端仍会把模型请求发往用户选择的模型服务商；本地压缩不意味着模型服务商流量消失。

更多操作细节见 [Token 智能与压缩指南](https://cli.rexai.top/zh/token-compression/)，发布记录见 [v3.6.0 更新日志](https://cli.rexai.top/zh/changelog/)。

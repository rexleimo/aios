# AIOS

[![Release](https://img.shields.io/github/v/release/rexleimo/aios?display_name=tag&sort=semver)](https://github.com/rexleimo/aios/releases)
[![Docs](https://img.shields.io/badge/docs-cli.rexai.top-0ea5e9)](https://cli.rexai.top/zh/)
[![License](https://img.shields.io/github/license/rexleimo/aios)](https://github.com/rexleimo/aios)
[![Node](https://img.shields.io/badge/node-24%20LTS-339933)](https://nodejs.org)

> **一句话，搞定任何复杂任务。**
> AIOS 让你的 AI 编码助手真正完成任务——记忆、验证、多 Agent 协作，一句话搞定。支持 `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok`。

[文档站](https://cli.rexai.top/zh/) · [快速开始](https://cli.rexai.top/zh/getting-started/) · [博客](https://cli.rexai.top/blog/zh/) · [English](README.md)

![AIOS 架构总览](docs-site/assets/visual-architecture-overview.svg)

## 为什么需要 AIOS

**一句话，搞定任何复杂任务。** 这就是 AIOS 的承诺。

你的 AI 编码助手（Codex、Claude Code、Gemini CLI、OpenCode、Hermes、Grok）很聪明——但它在会话之间会忘记一切，无法协调复杂的多步骤工作，也无法验证自己的输出。AIOS 解决所有这些问题：

| 你说 | AIOS 做 |
| --- | --- |
| "重构认证模块" | 记住上周的决策，选择正确的方法，完成修改，并验证它有效 |
| "审查这个 PR 并更新测试" | 将工作分配给多个并行 Agent，保持耦合变更的顺序，收集证据 |
| "今晚完成发布交接" | 运行完整目标，设置检查点，中断后可恢复，交付经过验证的结果 |
| "修复登录 bug" | 召回相关上下文，路由到最简单的修复路径，修复后先检查再给你看 |

**你的数据保持本地。** 一切——记忆、日志、验证——都在你的机器上运行。什么都不离开。

**你不需要改变工作方式。** 继续使用你已有的编码客户端。AIOS 补上它缺少的能力。

## 30 秒安装

macOS / Linux：

```bash
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc   # 或 ~/.bashrc
aios init --all
aios doctor --native --verbose
```

Windows PowerShell：

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
aios init --all
aios doctor --native --verbose
```

需要项目级指引和记忆时，请在**项目根目录**执行。

无人值守：

```bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

## 它怎么拼在一起

```text
你的编码客户端（codex / claude / gemini / opencode / hermes / grok）
        │
        ▼
  AIOS 指引 + Workflow Policy
        │
        ├── ContextDB    本地项目记忆（按需拉取）
        ├── rex-harness  软件工程控制面（Fact → Capability → Evidence）
        ├── Team / Solo  并行协作或可恢复长任务
        └── Doctor / Privacy / 验证证据
```

![工作流路由](docs-site/assets/visual-workflow-policy.svg)

`rex-harness` 是 AIOS 规划运行时的必需内核。Release 安装包已内置固定版本 submodule，**不需要**再装第二个 npm 包，也不需要单独起 rex MCP。源码开发建议：

```bash
git clone --recurse-submodules https://github.com/rexleimo/aios.git
```

若普通 clone 没拉 submodule，`aios init` / `aios setup` 会尝试 `git submodule update --init --recursive -- rex-harness`，失败时给出明确修复提示。

新安装默认走 Rex 工作流；Superpowers 已作为 AIOS 工作流组件退役。详见 [Rex 工作流迁移](https://cli.rexai.top/zh/superpowers/)。

## 快速体验

```bash
# 初始化项目标记与已检测客户端的指引
aios init --all

# 检查安装、原生客户端同步、安全门禁
aios doctor --native --verbose

# 保存并搜索一条持久项目决策
aios memo add "保持认证测试严格"
aios memo search "认证"

# 并行工作或可恢复目标
aios work "审查 auth 模块并更新测试"
aios team 3:codex "审查 auth 模块并更新测试"
aios harness run --objective "完成发布交接" --worktree

# 预览自适应策略，不创建真实计划
node scripts/aios.mjs plan auto-gate --task "重构 auth 模块" --dry-run --json
```

项目标记会把客户端指向 `.aios/context-db/index.json`。ContextDB 是**按需读取**：Agent 搜索/召回相关资料，而不是每次提示塞完整历史。

![ContextDB 记忆循环](docs-site/assets/visual-contextdb-memory-loop.svg)

## 支持的客户端

`codex` · `claude` · `gemini` · `opencode` · `hermes` · `grok`（Grok Build）

不同客户端功能深度可能不同，请以 `aios doctor --native --verbose` 本机结果为准。

## 文档地图

| 你想做什么 | 从这里开始 |
| --- | --- |
| 安装并验证 | [快速开始](https://cli.rexai.top/zh/getting-started/) |
| Windows 恢复 | [Windows 指南](https://cli.rexai.top/zh/windows-guide/) |
| 选对工作流路径 | [工作流策略](https://cli.rexai.top/zh/workflow-policy/) |
| 项目记忆 | [ContextDB](https://cli.rexai.top/zh/contextdb/) |
| Token / 压缩边界 | [Token Intelligence](https://cli.rexai.top/zh/token-compression/) |
| 多 Agent 协作 | [Agent Team](https://cli.rexai.top/zh/team-ops/) |
| 可恢复长任务 | [Solo Harness](https://cli.rexai.top/zh/solo-harness/) |
| 按意图找命令 | [按场景找命令](https://cli.rexai.top/zh/use-cases/) |
| 运行时分层 | [架构](https://cli.rexai.top/zh/architecture/) |
| 版本与教程 | [博客](https://cli.rexai.top/blog/zh/) |

## 环境要求

- Git
- Node.js **24 LTS** 与 npm
- Windows：PowerShell 5.x 或 7
- 至少一个受支持的编码客户端

## 开发

```bash
git clone --recurse-submodules https://github.com/rexleimo/aios.git
cd aios
npm run test:scripts
cd mcp-server && npm run typecheck && npm test && npm run build
```

## 子项目

| 路径 | 作用 |
| --- | --- |
| [`rex-harness/`](rex-harness/) | 可独立运行的软件工程控制面（Fact / Capability / Evidence） |
| [`mcp-server/`](mcp-server/) | 遗留 Playwright MCP 兼容路径；默认浏览器路径为 browser-use CDP |

## 许可

版本历史见 [CHANGELOG.md](CHANGELOG.md)。

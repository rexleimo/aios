# AIOS

[![Release](https://img.shields.io/github/v/release/rexleimo/aios?display_name=tag&sort=semver)](https://github.com/rexleimo/aios/releases)
[![Docs](https://img.shields.io/badge/docs-cli.rexai.top-0ea5e9)](https://cli.rexai.top/zh/)
[![License](https://img.shields.io/github/license/rexleimo/aios)](https://github.com/rexleimo/aios)
[![Node](https://img.shields.io/badge/node-24%20LTS-339933)](https://nodejs.org)

> **本地优先的 Agent Harness**，面向 `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok`（Grok Build）。
> 不替换你正在用的编码客户端，只补上：项目记忆、自适应路由、多 Agent 协作、验证门禁。

[文档站](https://cli.rexai.top/zh/) · [快速开始](https://cli.rexai.top/zh/getting-started/) · [工作流策略](https://cli.rexai.top/zh/workflow-policy/) · [博客](https://cli.rexai.top/blog/zh/) · [English](README.md)

![AIOS 架构总览](docs-site/assets/visual-architecture-overview.svg)

## 为什么需要 AIOS

AIOS 把两个概念合在一起：**Local（本地引擎）** 与 **Harness（编排马甲）**。

- **Local** — 编码引擎（Codex、Claude Code、Gemini CLI、OpenCode、Hermes、Grok）跑在你的机器上；AIOS 再补上本地项目记忆（ContextDB）、本地 Token 压缩（RTK / Caveman / Headroom）、本地浏览器与隐私守卫。数据不出本机。
- **Harness** — AIOS 是这些引擎之上的编排层：自适应路由（`direct` / `guarded` / `planned`）、并行 Agent 团队（扇出 / 扇入）、可恢复的长任务循环（`aios harness`）、带契约校验的证据门禁、按节点分配模型档位。这与 Graph Engineering 是同一套构件——节点、边、共享状态、失败路由——只是围绕「运行本地循环的 Agent」来组织。

裸编码 CLI 很擅长改代码，但常见痛点是：

| 裸 CLI 的痛点 | AIOS 补上的能力 |
| --- | --- |
| 换会话就丢上下文 | **ContextDB** 项目记忆（memo / checkpoint / 可搜索包） |
| 所有任务都像同一个聊天窗 | **Workflow Policy**：按风险选 `direct` / `guarded` / `planned` |
| 多步骤任务容易断线 | **rex-harness** 控制面 + Solo Harness 可恢复长任务 |
| 并行 Agent 全靠手搓 | **Agent Team**（状态、HUD、证据） |
| 工具输出把模型上下文淹没 | **RTK / Caveman / Headroom** 本地压缩边界 |
| “做完了”只是感觉 | **Doctor、测试、隐私脱敏、验证门禁** |

AIOS **不会**取代 Codex / Claude Code / Gemini CLI / OpenCode / Hermes / Grok Build，而是作为它们之下的本地工作流层。

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

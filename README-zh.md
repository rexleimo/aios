# AIOS

[![Release](https://img.shields.io/github/v/release/rexleimo/aios?display_name=tag&sort=semver)](https://github.com/rexleimo/aios/releases)
[![Docs](https://img.shields.io/badge/docs-cli.rexai.top-0ea5e9)](https://cli.rexai.top/zh/)
[![Local-first](https://img.shields.io/badge/本地优先-Agent_控制平面-7c3aed)](https://cli.rexai.top/zh/architecture/)
[![License](https://img.shields.io/github/license/rexleimo/aios)](https://github.com/rexleimo/aios)
[![Node](https://img.shields.io/badge/node-24%20LTS-339933)](https://nodejs.org)

> **面向长程编码 Agent 的本地优先控制平面。**
> AIOS 补上你的 AI 编码助手缺少的能力——跨会话项目记忆、多 Agent 协作、可恢复的过夜任务、以及每次变更的可验证证据。**一句话，搞定任何复杂任务。**

**它运行在你已有的 Agent 之上**——Codex CLI、Claude Code、Gemini CLI、OpenCode、Hermes、Grok。AIOS 不是又一个 Agent 框架：Agent 还是你的 Agent，AIOS 只是在外围补上记忆、协调与验证这一层控制平面，且一切都在本地运行。

[为什么需要 AIOS](#为什么需要-aios) · [30 秒安装](#30-秒安装) · [证据](#证据不是承诺) · [文档站](https://cli.rexai.top/zh/) · [博客](https://cli.rexai.top/blog/zh/) · [English](README.md)

![AIOS 架构总览](docs-site/assets/visual-architecture-overview.svg)

## 为什么需要 AIOS

你的 AI 编码助手很聪明——但它在会话之间会忘记一切，无法独立协调多步骤工作，也没有办法验证自己的输出。长程任务（大型重构、发布交接、过夜运行）恰恰在单会话 Agent 的能力边界处崩掉。AIOS 解决这个问题：

| 你说 | AIOS 做 |
| --- | --- |
| "重构认证模块" | 记住上周的决策，选择正确的方法，完成修改，并验证它有效 |
| "审查这个 PR 并更新测试" | 将工作分配给多个并行 Agent，保持耦合变更的顺序，收集证据 |
| "今晚完成发布交接" | 运行完整目标，设置检查点，中断后可恢复，交付经过验证的结果 |
| "修复登录 bug" | 召回相关上下文，路由到最简单的修复路径，修复后先检查再给你看 |

**你的数据保持本地。** 一切——记忆、日志、验证证据——都在你的机器上运行，什么都不离开。

**你不需要改变工作方式。** 继续使用你已有的编码客户端。AIOS 补上它缺少的控制平面。

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

**装好了的判断标准：**

- `aios doctor --native --verbose` 报告你的客户端已检测并同步
- 项目根目录出现 `.aios/context-db/index.json`
- `aios memo search "任意词"` 能正常返回

## 证据，不是承诺

Agent 的口头承诺不值钱，所以 AIOS 从设计上就不需要你"信"它：

- **每次运行都留下证据。** Harness 运行产出证据信封——命令、退出码、哈希、测试输出——写进 `.aios/` 目录，而不是口头保证。见 [Solo Harness](https://cli.rexai.top/zh/solo-harness/)。
- **项目自我验证。** 每个发布都通过脚本测试套件和严格的 `typecheck && test && build` 门禁，[changelog](https://cli.rexai.top/zh/changelog/) 记录改了什么、为什么改。
- **安装可检查。** `aios doctor --native --verbose` 如实报告检测、同步、跳过了什么，没有静默副作用。
- **记忆可检查。** ContextDB 按需读取且完全本地：用 `aios memo search` 搜出 Agent 记得什么，数据不离开你的机器。

AIOS 由 [Rex](https://rexai.top) 公开维护——发布历史就是一份持续交付、持续验证的记录。

## 它怎么拼在一起

```text
你的编码客户端（codex / claude / gemini / opencode / hermes / grok / workbuddy）
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
aios plan auto-gate --task "重构 auth 模块" --dry-run --json
```

项目标记会把客户端指向 `.aios/context-db/index.json`。ContextDB 是**按需读取**：Agent 搜索/召回相关资料，而不是每次提示塞完整历史。

![ContextDB 记忆循环](docs-site/assets/visual-contextdb-memory-loop.svg)

## 支持的客户端

七个编码客户端提供原生或兼容集成——同样的项目记忆、同样的工作流策略、同样的验证证据：

`codex` · `claude` · `gemini` · `opencode` · `hermes` · `grok`（Grok Build） · `workbuddy`（CodeBuddy CLI）

不同客户端功能深度可能不同，请以 `aios doctor --native --verbose` 本机结果为准。

## 文档地图

| 你想做什么 | 从这里开始 |
| --- | --- |
| 安装并验证 | [快速开始](https://cli.rexai.top/zh/getting-started/) |
| Agent 为什么会忘记上下文 | [为什么 Agent 会忘记上下文](https://cli.rexai.top/zh/why-agents-forget-context/) |
| 过夜 / 可恢复运行 | [过夜 Agent 运行](https://cli.rexai.top/zh/overnight-agent-runs/) |
| 编码 Agent 怎么选 | [Claude Code vs Codex vs Gemini](https://cli.rexai.top/zh/claude-code-vs-codex-vs-gemini/) |
| Windows 恢复 | [Windows 指南](https://cli.rexai.top/zh/windows-guide/) |
| 选对工作流路径 | [工作流策略](https://cli.rexai.top/zh/workflow-policy/) |
| 项目记忆 | [ContextDB](https://cli.rexai.top/zh/contextdb/) |
| Token / 压缩边界 | [Token Intelligence](https://cli.rexai.top/zh/token-compression/) |
| 多 Agent 协作 | [Agent Team](https://cli.rexai.top/zh/team-ops/) |
| 可恢复长任务 | [Solo Harness](https://cli.rexai.top/zh/solo-harness/) |
| 按意图找命令 | [按场景找命令](https://cli.rexai.top/zh/use-cases/) |
| 运行时分层 | [架构](https://cli.rexai.top/zh/architecture/) |
| 版本与教程 | [博客](https://cli.rexai.top/blog/zh/) |

## 作者与生态

AIOS 由 [Rex](https://rexai.top)（[@rexleimo](https://github.com/rexleimo)）开发维护，他在 [RexAI 内容站](https://rexai.top)（梦兽编程）持续写 AI Agent、Rust 与系统方向的中文文章。

| 站点 | 内容 |
| --- | --- |
| [cli.rexai.top](https://cli.rexai.top) | AIOS 文档、指南与博客 |
| [rexai.top](https://rexai.top) | 作者博客——AI Agent、Rust 与系统（中文） |
| [os.rexai.top](https://os.rexai.top) | RexOS——配套的 Agent OS 项目 |
| [tool.rexai.top](https://tool.rexai.top) | 免费开发者工具 |

问题或反馈请 [提 issue](https://github.com/rexleimo/aios/issues)。如果 AIOS 帮你跑成过一次过夜任务，点个 ⭐ Star 让更多开发者看到它。

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

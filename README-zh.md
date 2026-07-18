# Harness CLI (AIOS)

> 面向 \`codex\`、\`claude\`、\`gemini\`、\`opencode\`、\`hermes\` 和 \`grok\`（Grok Build）的本地优先工作流层。它为你正在使用的编码客户端增加项目记忆、协作、路由和验证能力，不会取代原有客户端。

[文档站](https://cli.rexai.top/zh/) | [快速开始](https://cli.rexai.top/zh/getting-started/) | [工作流策略](https://cli.rexai.top/zh/workflow-policy/) | [博客](https://cli.rexai.top/blog/zh/) | [友情链接](https://cli.rexai.top/zh/friends/) | [更新日志](https://cli.rexai.top/zh/changelog/) | [GitHub](https://github.com/rexleimo/harness-cli)

## 快速开始

macOS / Linux：

\`\`\`bash
curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all
aios doctor --native --verbose
\`\`\`

Windows PowerShell：

\`\`\`powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
aios init --all
aios doctor --native --verbose
\`\`\`

如果要启用项目级客户端指引和记忆，请在项目根目录执行这些命令。无人值守安装可以使用 \`node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp\`；这些参数会明确授权安装压缩工具包以及写入用户级 MCP 配置。

`rex-harness` 是 AIOS 智能规划的必需运行时。Release 安装包已经携带固定版本的 submodule 内容，不需要额外安装 npm 包，也不需要启动 rex MCP 服务。源码开发建议使用 `git clone --recurse-submodules https://github.com/rexleimo/harness-cli.git`；如果普通 clone 没有拉取 submodule，`aios init`/`aios setup` 会自动尝试执行 `git submodule update --init --recursive -- rex-harness`，无法修复时会明确提示重新安装或重新初始化。

## Harness CLI 增加了什么

Harness CLI 由多个职责不同、边界明确的层组成：

| 层 | 提供能力 | 从这里开始 |
| --- | --- | --- |
| **ContextDB** | 基于按需读取的项目记忆、memo、检查点和可搜索上下文包 | \`aios init\` 与 [ContextDB](https://cli.rexai.top/zh/contextdb/) |
| **Workflow Policy** | 按风险选择 \`noop\`、\`direct\`、\`guarded\`、\`planned\`，并明确计划持久化规则 | [工作流策略](https://cli.rexai.top/zh/workflow-policy/) |
| **Agent Team / Solo Harness** | 有状态和证据的并行协作或可恢复长任务 | \`aios team\` / \`aios harness run\` |
| **RTK** | 在 Agent 读取前过滤嘈杂的 shell 和工具输出 | \`aios init --all\` |
| **Caveman** | 保留技术事实的简洁响应风格 skill | \`aios init --all\` |
| **Headroom MCP** | 通过支持的 MCP 客户端显式按需压缩和取回内容 | \`aios init --all --yes-headroom-mcp\` |
| **Verification / Privacy** | 测试、诊断、质量门禁以及敏感内容共享前的脱敏 | \`aios doctor\` / \`aios privacy\` |

RTK、Caveman 和 Headroom 的集成边界不同。Harness CLI 不声称每个客户端启动都会自动被包装、不声称模型供应商流量会消失，也不会把未经本地测量的压缩百分比当成项目保证。

## 快速体验

\`\`\`bash
# 初始化项目标记和已检测客户端的指引。
aios init --all

# 检查安装、原生客户端同步和安全门禁。
aios doctor --native --verbose

# 保存并搜索一条持久项目决策。
aios memo add "保持认证测试严格"
aios memo search "认证"

# 为独立工作或可恢复目标选择工作流。
aios team 3:codex "审查 auth 模块并更新测试"
aios harness run --objective "完成发布交接" --worktree

# 预览自适应策略，不创建真实计划。
node scripts/aios.mjs plan auto-gate --task "重构 auth 模块" --dry-run --json
\`\`\`

项目标记会把客户端指向 \`.aios/context-db/index.json\`。ContextDB 是按需读取的：Agent 可以搜索或召回相关项目资料，而不是每次提示都收到完整历史。详细文件结构和命令见 [ContextDB](https://cli.rexai.top/zh/contextdb/)。

## 支持的客户端

Harness CLI 当前为 \`codex\`、\`claude\`、\`gemini\`、\`opencode\`、\`hermes\` 和 \`grok\`（Grok Build）提供原生或兼容集成。不同客户端的功能深度可能不同，请运行 \`aios doctor --native --verbose\` 查看本机实际状态，不要假设每个客户端都支持全部路由。

## 文档地图

- [快速开始](https://cli.rexai.top/zh/getting-started/) - 安装、初始化并验证第一个项目。
- [Windows 指南](https://cli.rexai.top/zh/windows-guide/) - PowerShell 前置条件和恢复命令。
- [工作流策略](https://cli.rexai.top/zh/workflow-policy/) - 选择最小正确路径，理解计划如何继续。
- [ContextDB](https://cli.rexai.top/zh/contextdb/) - 本地存储、统一搜索、memo 作用域和上下文包。
- [Token Intelligence](https://cli.rexai.top/zh/token-compression/) - RTK、Caveman、Headroom MCP 和安全上下文边界。
- [Agent Team](https://cli.rexai.top/zh/team-ops/) - 带 HUD 证据的治理型并行工作。
- [Solo Harness](https://cli.rexai.top/zh/solo-harness/) - 可恢复长任务。
- [按场景找命令](https://cli.rexai.top/zh/use-cases/) - 按用户意图组织命令。
- [架构](https://cli.rexai.top/zh/architecture/) - 运行时层和兼容性边界。
- [故障排查](https://cli.rexai.top/zh/troubleshooting/) - 按可观察症状恢复。
- [博客](https://cli.rexai.top/blog/zh/) - 教程、版本说明和可复现工作流。

## 环境要求

- Git
- Node.js 24 LTS 和 npm
- Windows：PowerShell 5.x 或 7
- 至少一个受支持的编码客户端

## 开发

\`\`\`bash
git clone https://github.com/rexleimo/harness-cli.git
cd harness-cli
npm run test:scripts
cd mcp-server
npm run typecheck
npm test
npm run build
\`\`\`

## 许可

版本历史请参阅 [CHANGELOG.md](CHANGELOG.md)。

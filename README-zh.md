# RexCLI (AIOS)

> 给 `codex` / `claude` / `gemini` / `opencode` 加上记忆、协作和验证能力的本地 Agent 工作流层。

[文档站](https://cli.rexai.top) | [快速开始](https://cli.rexai.top/zh/getting-started/) | [官方案例库](https://cli.rexai.top/zh/case-library/) | [GitHub](https://github.com/rexleimo/rex-cli)

## 安装

macOS / Linux:

```bash
curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios
```

Windows PowerShell:

```powershell
irm https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
aios
```

启动后选择 `Setup`，运行 `Doctor`，即可开始使用。

## 核心能力

| 能力 | 说明 | 命令 |
|------|------|------|
| **ContextDB** | 跨会话项目记忆，事件/检查点/上下文包持久化 | `codex` / `claude` 自动加载 |
| **自研 Token 压缩** | 参考 RTK/Caveman 的思路，但不安装竞品工具；本地完成输入/输出省 token | `context:pack --token-budget 1200 --token-strategy balanced` |
| **Model Router** | Agent Team 智能多模型调度 — 按能力、成本、成功率匹配最优模型 | `node scripts/aios.mjs model-router route --task "..."` |
| **Agent Team** | 多 Agent 并行协作，HUD 可视化追踪 | `aios team 3:codex "任务描述"` |
| **Solo Harness** | 单 Agent 过夜长任务，可恢复、有运行日志 | `aios harness run --objective "目标" --worktree` |
| **Perception** | 内容结果追踪 + 统计洞察 + 感知注入 | `aios perception record` / `insights` / `summary` |
| **Browser MCP** | 隐身浏览器自动化，CDP 协议 | `aios internal browser doctor` |
| **Superpowers** | 可复用工作流技能（brainstorm/plan/debug/verify） | TUI 中选择 |
| **Privacy Guard** | 敏感文件读取前自动脱敏 | `aios privacy status` |

## 快速体验

```bash
# 启动 TUI
aios

# 多 Agent 协作
aios team 3:codex "重构登录模块并运行测试"

# 智能模型路由
node scripts/aios.mjs model-router route --task "审查 auth.js 安全漏洞"

# 自研 token 压缩 ContextDB 包
cd mcp-server && npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced

# 单 Agent 过夜任务
aios harness run --objective "完成明天的交接文档" --worktree

# 内容结果追踪（小红书等场景）
aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "测试" --metrics '{"likes":100}'

# 查看任务状态
aios team status --provider codex --watch
```

## 工作原理

```text
用户 → codex / claude / gemini
     → zsh wrapper（透明包装）
     → ctx-agent.mjs（ContextDB 集成）
        → contextdb CLI（记忆持久化）
        → 启动原生 CLI（附带上下文包）
     → browser MCP（可选浏览器自动化）
```

安装后，直接使用 `codex`、`claude`、`gemini` 命令即可，RexCLI 自动在后台加载项目记忆。

## 文档

- [快速开始](https://cli.rexai.top/zh/getting-started/) — 安装、配置、首次运行
- [Model Router](https://cli.rexai.top/zh/model-router/) — Agent Team 多模型智能调度
- [ContextDB](https://cli.rexai.top/zh/contextdb/) — 项目记忆系统详解
- [Agent Team](https://cli.rexai.top/zh/team-ops/) — 多 Agent 协作指南
- [Solo Harness](https://cli.rexai.top/zh/solo-harness/) — 过夜长任务指南
- [Perception](https://cli.rexai.top/zh/perception/) — 内容结果追踪与洞察
- [架构](https://cli.rexai.top/zh/architecture/) — 系统架构说明
- [故障排查](https://cli.rexai.top/zh/troubleshooting/) — 常见问题解决
- [按场景找命令](https://cli.rexai.top/zh/use-cases/) — CLI 工作流速查

## 环境要求

- Git
- Node.js 22 LTS + npm
- Windows: PowerShell 5.x 或 7

## 开发

```bash
git clone https://github.com/rexleimo/rex-cli.git
cd rex-cli
```

验证:

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
```

## 许可

详见 [CHANGELOG.md](CHANGELOG.md) 版本历史。

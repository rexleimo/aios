---
name: aios-interception-runtime
description: RTK + Caveman community token compression tools install and config guide. RTK (github.com/rtk-ai/rtk) compresses command output 60-90%. Caveman (github.com/JuliusBrussee/caveman) cuts output tokens ~75%. Both run locally, no external services. The AIOS native interception runtime is deprecated.
primary: false

installCatalogName: aios-interception-runtime
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, token, compression, rtk, caveman, community]
repoTargets: [codex, claude, gemini, opencode, hermes]
---

<!-- 中文注释：Skill 已重写为 RTK + Caveman 社区工具安装配置指南。原生拦截运行时已废弃。 -->

# RTK + Caveman 社区工具安装配置指南

AIOS 原生拦截运行时已废弃。Token 压缩改由社区维护的 **RTK** 和 **Caveman** 处理。

- **RTK** (https://github.com/rtk-ai/rtk) — Rust CLI 代理，过滤和压缩命令输出 60-90%。单二进制，<10ms 开销，100+ 支持命令。本地运行，无外部服务。
- **Caveman** (https://github.com/JuliusBrussee/caveman) — Claude Code skill/插件，压缩 agent 输出 token ~75%。保持技术准确性，仅压缩表述风格。本地 prompt skill。

## 一、自动安装

`aios init` 会自动检测并安装 RTK + Caveman（带有安装确认提示）：

```bash
# 交互式安装（会提示确认）
node scripts/aios.mjs init --agent <claude|codex|gemini|opencode>

# 跳过确认提示（用于 CI/无人值守场景）
node scripts/aios.mjs init --yes-compression-tools

# 仅检测不安装
node scripts/aios.mjs init --dry-run
```

安装后 `aios init` 会自动运行 `rtk init -g` 为检测到的客户端注册 hook/plugin。

## 二、手动安装

### RTK

```bash
# macOS (推荐)
brew install rtk

# Linux / macOS / WSL
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Windows (下载预编译二进制)
# 从 https://github.com/rtk-ai/rtk/releases 下载 rtk-x86_64-pc-windows-msvc.zip
# 解压到 PATH 中的目录（如 C:\Users\<you>\.local\bin）

# Cargo
cargo install --git https://github.com/rtk-ai/rtk

# 验证
rtk --version   # 应显示 rtk 0.28.2+
rtk gain        # 查看 token 节省统计
```

#### RTK 初始化

```bash
rtk init -g                     # Claude Code / Copilot (默认)
rtk init -g --gemini            # Gemini CLI
rtk init -g --codex             # Codex (OpenAI)
rtk init --agent cursor         # Cursor
rtk init --agent windsurf        # Windsurf
rtk init --agent cline          # Cline / Roo Code
rtk init --agent hermes         # Hermes
```

### Caveman

```bash
# macOS / Linux / WSL / Git Bash
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash

# Windows (PowerShell 5.1+)
$installer = Join-Path $env:TEMP 'caveman-install.ps1'
irm https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 -OutFile $installer
powershell -NoProfile -ExecutionPolicy Bypass -File $installer
Remove-Item $installer -Force
```

安装后约 30 秒。需要 Node >= 18。会自动检测已安装的客户端并跳过没有的。
安全重复运行。

#### Caveman 使用

```bash
/caveman              # 激活 caveman 模式（默认 full）
/caveman lite         # 轻度：去掉填充语
/caveman full         # 完整 caveman 模式（默认）
/caveman ultra        # 极简：电报体
/caveman wenyan       # 文言文模式（更短）

# 其他命令
/caveman-commit       # 压缩 commit message
/caveman-review       # 一行 PR 评论
/caveman-stats        # token 使用统计
/caveman-compress <file>  # 压缩文件内容

# 退出
"normal mode"         # 恢复正常输出
```

## 三、压缩级别参考

| 工具 | 级别 | 输出形态 | 适用场景 |
|------|------|---------|---------|
| RTK | (自动) | 过滤噪声、分组、截断、去重 | 所有 shell 命令输出 |
| Caveman | `lite` | 去掉填充语 | 轻度压缩 |
| Caveman | `full` | Caveman 表述 | 默认，日常使用 |
| Caveman | `ultra` | 电报体 | 最大压缩 |
| Caveman | `wenyan` | 文言文 | 中文场景最短 |

## 四、隐私说明

- **RTK**：本地 Rust 二进制，过滤和压缩命令输出。不发送数据到外部服务。
- **Caveman**：本地 prompt skill，压缩 agent 输出风格。压缩后的输出进入 LLM 上下文（和正常对话一样），但不经过额外中继。
- 两者均为本地运行，不需要外部 API 或服务。
- `--yes-compression-tools` 跳过安装确认提示（用于 CI/无人值守场景）。

## 五、故障排查

### RTK 未运行

```bash
# 检查安装
rtk --version
which rtk

# 检查 token 节省
rtk gain

# 重新初始化
rtk init -g
```

### Windows 上 RTK hook 不工作

RTK 的 auto-rewrite hook 需要 Unix shell。在原生 Windows 上，RTK 回退到 CLAUDE.md injection 模式。
推荐使用 WSL 获得完整 hook 支持。详见 https://github.com/rtk-ai/rtk#windows

### Caveman 未激活

```bash
# 在 Claude Code 中输入
/caveman

# 或让 agent 读取安装文件
# "Read CLAUDE.md and INSTALL.md, install caveman for me."
```

### 从 AIOS 原生拦截迁移

1. 运行 `aios init` 安装 RTK + Caveman
2. 旧的 `scripts/aios-mcp-proxy.mjs` 和 `scripts/aios-intercept.mjs` 已标记 deprecated，不需要删除但不再维护
3. 旧的 `.aios/interception/metrics/` 目录可以清理但不影响功能
4. 旧配置 `config/aios-interception.json` 不再被读取

## 六、AIOS Token Discipline（仍保留）

AIOS token discipline profiles（`minimal | balanced | full`）作为 pre-context 卫生层保留，与 RTK/Caveman 互补：

- `minimal`: 使用最小有用上下文
- `balanced`: 默认，保留足够证据但避免噪声
- `full`: 仅用于调试/审计/审查

这些 profile 是提示层卫生，不替代 RTK/Caveman 的深度压缩。

## Boundaries

- RTK 是 Rust 二进制，通过 hook/plugin 机制拦截命令输出
- Caveman 是 prompt skill，改变 agent 输出风格
- 两者互补：RTK 压缩输入（工具输出），Caveman 压缩输出（agent 回复）
- AIOS 原生拦截运行时代码保留但不再积极维护
- Token discipline profiles 是 pre-context 卫生层
- 遇到工具本身的 bug 应向对应社区报告

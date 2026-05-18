---
title: 故障排查
description: 常见报错与修复步骤。
---

# 故障排查

## 快速答案（AI 搜索）

大多数问题来自环境与作用域配置（MCP 依赖缺失、包装未加载、wrap 模式不匹配）。先跑诊断，再改配置。

## ContextDB 切换 Node 后失败

RexCLI 现在明确以 **Node 24 LTS** 为运行基线，ContextDB 使用 Node 内置的 `node:sqlite`，不再需要重建外部 SQLite native addon。

如果命令直接报 `Unable to resolve a Node runtime matching .nvmrc=24` 或 `[node-version] AIOS requires Node 24.x LTS`，说明本机还没有切到可用的 Node 24，需要先安装再重试。

快速修复：

```bash
node -v
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
cd mcp-server && npm run test:contextdb
```

然后重新验证：

```bash
npm run test:scripts
```

## Browser MCP 工具不可用

**大多数情况**: Playwright MCP 未安装，或 `~/.config/codex/` (或 `~/.config/claude/` 等) 的 MCP 配置中缺少 `puppeteer-stealth` 别名。

用 Doctor 脚本检查：

=== "macOS / Linux"

    ```bash
    scripts/doctor-browser-mcp.sh
    ```

=== "Windows (PowerShell)"

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\doctor-browser-mcp.ps1
    ```

或手动打开 `~/.config/codex/mcp.json`（或 Claude Code 的 `~/.config/claude/settings.json`，Gemini CLI 的 `~/.gemini/mcp.json`），确保包含：

```json
{
  "mcpServers": {
    "puppeteer-stealth": {
      "command": "node",
      "args": ["/path/to/rex-cli/mcp-server/dist/puppeteer-stealth-server.js"]
    }
  }
}
```

## `EXTRA_ARGS[@]: unbound variable`

原因：旧版 `ctx-agent.sh` 在 `bash set -u` 空数组展开边界情况下的错误。

修复：

1. 拉取最新的 `main`。
2. 重新打开 shell 并重试 `claude`/`codex`/`gemini`。

最新版本使用统一的运行时核心（`ctx-agent-core.mjs`）来处理 shell 和 Node wrapper，避免了这类漂移。

## 命令完全没有被包装

检查这些条件：

- 你当前在一个 git 仓库里（`git rev-parse --show-toplevel` 能成功）
- `ROOTPATH/scripts/contextdb-shell.zsh` 存在并且已经被 `source`
- `CTXDB_WRAP_MODE` 允许当前仓库（`opt-in` 模式需要 `.contextdb-enable`）

先跑 wrapper doctor：

```bash
scripts/doctor-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-contextdb-shell.ps1
```

## `search` 结果异常为空

如果 `.aios/context-db/index/context.db` 丢失或过期：

1. 执行 `cd mcp-server && npm run contextdb -- index:rebuild`
2. 重新执行 `search` / `timeline` / `event:get`

## `contextdb context:pack` 失败

AIOS 会在启动 `codex/claude/gemini` 之前先生成 ContextDB 上下文包（`context:pack`）。

如果打包失败，`ctx-agent` 默认会**告警并继续运行**（不注入上下文，也不让 CLI 整体起不来）。

如果你希望打包失败直接中断（严格模式）：

```bash
export CTXDB_PACK_STRICT=1
```

注意：shell wrapper（`codex`/`claude`/`gemini`）默认会 fail-open，即便设置了 `CTXDB_PACK_STRICT=1` 也不会让交互式会话直接"起不来"。如果你希望包装层也严格执行：

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

如果频繁出现，建议先跑仓库门禁（包含 ContextDB 回归检查）：

```bash
aios quality-gate pre-pr --profile strict
```

## `codex /new` 或 `claude/gemini /clear` 后上下文"没了"

`/new` / `/clear` 重置的是 **CLI 内部的对话状态**。ContextDB 仍在磁盘上，但包装层只会在 **启动 CLI 进程时** 注入一次 context packet。

处理方式：

1. 推荐：退出 CLI，然后在 shell 里重新执行 `codex` / `claude` / `gemini`。
2. 如果必须在同一进程里继续：在新对话第一句让模型先读取：
   - `@.aios/context-db/exports/latest-codex-cli-context.md`
   - `@.aios/context-db/exports/latest-claude-code-context.md`
   - `@.aios/context-db/exports/latest-gemini-cli-context.md`

如果客户端不支持 `@file` 引用，请把文件内容粘贴为首条消息。

## `aios orchestrate --execute live` 被阻止/失败

确保设置了 `AIOS_EXECUTE_LIVE` 和 `AIOS_SUBAGENT_CLIENT`：

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli  # 必填（live 目前仅支持 codex-cli）
```

如果你使用 `codex` v0.114+，AIOS 会优先使用 `codex exec` 结构化输出以获得稳定的 JSON handoff（旧版本自动降级）。Codex 子进程默认附加 `--dangerously-bypass-approvals-and-sandbox`，避免 unattended live run 等待 approval/sandbox prompt；只有手动调试时才建议设置 `AIOS_SUBAGENT_CODEX_UNATTENDED=0` 关闭。

如果 routed startup 还在当前这个非 AIOS 仓库里找 `scripts/aios.mjs`，先拉取最新 `main`。最近的版本已经把 routed `ctx-agent` startup 改成按当前工作区感知，而不是假定 source-repo 布局。

## `CODEX_HOME points to ".codex"` 错误

原因：`CODEX_HOME` 被设置成了相对路径。

修复：

```bash
export CODEX_HOME="$HOME/.codex"
mkdir -p "$CODEX_HOME"
```

最新 wrapper 脚本也会在命令执行时自动规范化相对路径的 `CODEX_HOME`。

## Wrapper 已加载但应该禁用

在 shell 配置中设置：

```zsh
export CTXDB_WRAP_MODE=off
```

## 技能意外地在多个项目间共享

技能加载作用域与 ContextDB 包装是分开的：

- 全局技能：`~/.codex/skills`、`~/.claude/skills`、`~/.gemini/skills`、`~/.config/opencode/skills`
- 仅项目技能：`<repo>/.codex/skills`、`<repo>/.claude/skills`

如果需要隔离，请将自定义技能放在 repo-local 文件夹中。

## 在 RexCLI 源仓库里执行 `--scope project` 失败

这是 canonical skill source 迁移后的预期行为。

现在：

- `skill-sources/` 是 canonical source tree
- repo-local 的 `.codex/skills` / `.claude/skills` / `.agents/skills` 是由 sync 管理的生成目录
- source repo 自己不再允许把 `--scope project` 当作安装入口

正确做法：

```bash
node scripts/sync-skills.mjs
node scripts/check-skills-sync.mjs
```

如果你是想把 skills 安装到别的项目，请切到那个目标工作区再执行 `aios ... --scope project`。

## Repo skills 在其他项目里不可全局使用

wrapper 和 skills 是故意分开的。全局 skills 需要单独安装：
`--client all` 会同时覆盖 `codex`、`claude`、`gemini` 和 `opencode`。

=== "macOS / Linux"

    ```bash
    scripts/install-contextdb-skills.sh --client all
    scripts/doctor-contextdb-skills.sh --client all
    ```

=== "Windows (PowerShell)"

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\install-contextdb-skills.ps1 -Client all
    powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-skills.ps1 -Client all
    ```

## GitHub Pages `configure-pages` 找不到

这通常意味着 Pages source 没有完全启用。

在 GitHub 设置中修复：

1. `Settings -> Pages -> Source: GitHub Actions`
2. 重新运行 `docs-pages` workflow。

## 常见问答

### 浏览器工具不可用时第一步做什么？

先运行 `scripts/doctor-browser-mcp.sh`（或 PowerShell 版本）查看缺失项。

### 为什么输入 `codex` 没有注入上下文？

通常是 wrapper 未加载、`CTXDB_WRAP_MODE` 未覆盖当前工作区，或者当前命令属于透传的管理子命令。

## 把技能放进了错误目录

canonical skill source tree 现在放在：

- `<repo>/skill-sources`

生成后的 repo-local discoverable 输出放在：

- `<repo>/.codex/skills`
- `<repo>/.claude/skills`

如果你把 `SKILL.md` 放进 `.baoyu-skills/` 之类的平行目录，Codex / Claude 不会把它当作可发现技能。

- `.baoyu-skills/` 只适合放 `EXTEND.md` 一类扩展配置
- canonical 技能源文件请移动到 `skill-sources/<name>/SKILL.md`
- 然后执行 `node scripts/sync-skills.mjs` 重建各 client 的兼容目录
- 运行 `scripts/doctor-contextdb-skills.sh --client all` 检查是否存在错误的技能根目录

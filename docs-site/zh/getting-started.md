---
title: 快速开始
description: Install Harness CLI, set it up, and run your first agent with memory — in about 3 minutes.
---

# 快速开始

**目标：** 读完本页后，你将安装好 Harness CLI，你的编码 Agent 将能够在会话之间记住事情。

听起来不错？让我们开始吧。

## 准备工作

在开始之前，请确保你拥有：

- **Node.js 24**（必需的 LTS 基线）— [在此下载](https://nodejs.org/) 或使用 `nvm install 24`
- **一个编码 CLI** — 至少其中之一：`codex`、`claude`、`gemini` 或 `opencode`
- **一个项目文件夹** — 任何你想让 Agent 拥有记忆的代码项目

检查你的 Node 版本：

```bash
node -v  # 应该显示 v22.x.x
```

??? note "需要安装或切换 Node？"
    ```bash
    nvm install 24
    nvm use 24
    ```

## 步骤 1：安装 Harness CLI

=== "macOS / Linux"

    ```bash
    curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    ```

    如果你使用 bash 而不是 zsh，请将 `source ~/.zshrc` 替换为 `source ~/.bashrc`。

=== "Windows PowerShell"

    ```powershell
    irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    ```

!!! tip "稳定版 vs 开发版"
    上面的命令安装的是**稳定版**（推荐）。只有在你特别想要 `main` 分支的未发布功能时才使用 `git clone`。

## 步骤 2：运行设置

打开 Harness CLI 菜单：

```bash
aios
```

你会看到一个 TUI（终端用户界面），其中有几个选项。**按这个顺序**做这两件事：

1. **选择 "Setup"** — 这会安装 shell 包装器和技能
2. **选择 "Doctor"** — 这会检查一切是否正常工作

<figure class="rex-visual">
  <img src="assets/visual-tui-setup-doctor.svg" alt="Setup first, Doctor second">
  <figcaption>始终先运行 Setup，然后运行 Doctor。如果 Doctor 显示零个关键错误，你就可以开始了。</figcaption>
</figure>

!!! warning "如果 Doctor 显示错误"
    别慌。大多数错误都很容易修复 — 缺失的 PATH 条目、错误的 Node 版本等。Doctor 会准确告诉你哪里出了问题，并经常提供自动修复。

设置后，重新加载你的 shell：

=== "macOS / Linux"
    ```bash
    source ~/.zshrc
    ```

=== "Windows PowerShell"
    ```powershell
    . $PROFILE
    ```

## 步骤 3：打开项目记忆

进入任何你想让 Agent 记住事情的项目文件夹：

```bash
cd /path/to/your/project
aios init
```

就这样。`aios init` 检测你已安装的编码 Agent（Claude Code、Codex CLI、Gemini CLI、OpenCode）并配置每个 Agent 使用记忆系统。它是**幂等的** — 多次运行也是安全的。

??? info "工作原理"
    `aios init` 添加一个轻量级标记（`<!-- AIOS: .aios/context-db/index.json -->`）到每个 Agent 的配置文件（CLAUDE.md、AGENTS.md、GEMINI.md）。当你的 Agent 启动时，它看到标记，读取上下文注册表，只加载它需要的内容 — 不再需要等待冗长的上下文注入。

??? info "选择加入模式（旧版）"
    如果你更喜欢旧的选择加入方法，仍然可以使用：

    === "macOS / Linux"
        ```bash
        touch .contextdb-enable
        ```

    === "Windows PowerShell"
        ```powershell
        New-Item -ItemType File -Path .contextdb-enable -Force
        ```

    新的 `aios init` 方法是推荐的 — 它给你更快的启动和跨 Agent 记忆共享。

## 步骤 4：启动你的 Agent

现在像平常一样启动你的 Agent：

```bash
codex
# 或者：claude
# 或者：gemini
```

你的 Agent 现在拥有**项目记忆**。它会记住：

- 你处理过的文件
- 你做出的决策
- 你遇到的错误
- 剩余待办事项

……即使你关闭终端，明天回来也能继续。

## 步骤 5：验证它是否正常工作

运行此命令检查记忆是否处于活跃状态：

```bash
aios doctor --native --verbose
ls .aios/context-db/
```

你应该看到像 `sessions/`、`index/` 或 `exports/` 这样的目录。这意味着记忆正在记录。

??? troubleshooting "看不到记忆目录？"
    1. 正常启动一次你的 Agent — Harness CLI 在首次运行时创建目录
    2. 如果仍然没有出现：`aios doctor --native --fix`

**你已经完成了！** 你的 Agent 现在有记忆了。继续阅读以了解你还可以做什么。

---

## 基础之外

你的记忆已经工作了。以下是按实用性排序的接下来可以尝试的事情：

### 使用 Memo 保存持久笔记

Memo 让你保存 Git 友好的项目笔记，你的 Agent 在每个会话中都会看到：

```bash
# 保存关于这个项目的笔记
aios memo add "此项目始终使用 TypeScript 严格模式"

# 保存提醒
aios memo pin add "永远不要直接推送到 main"

# 以后搜索你的笔记
aios memo search "typescript"

# 检查当前存储实现
aios memo storage status
```

默认情况下，项目备忘录是追加式 JSONL，保存在 `.aios/memo/file/events.jsonl` 下。只有当你希望每个备忘录事件使用一个 JSON 文件时才使用 `aios memo storage use split`；`storage rebuild` 重新生成派生查询文件，但不重写规范记录。

### 设置你的 Agent 性格

你可以告诉 Harness CLI 你的 Agent 在所有项目中应该如何表现：

```bash
# 设置 Agent 的沟通风格
aios memo persona init
aios memo persona add "回复风格：简洁、直接、证据优先"

# 设置你自己的偏好
aios memo user init
aios memo user add "首选语言：zh-CN + 技术英语术语"
```

这些配置文件适用于所有地方 — 而不仅仅是一个项目。

### 同时运行多个 Agent

当一个任务对于一个 Agent 来说太大时，将其分发给多个 worker：

```bash
# 启动 3 个 Agent 并行工作
aios team 3:codex "构建设置页面，添加测试，并更新文档"

# 观察他们的进度
aios team status --watch
```

!!! tip "何时使用团队"
    只有当任务可以**分解为独立部分**时才使用 Agent Team。对于单文件修复或不清楚的需求，坚持使用一个 Agent。

### 让 Agent 通宵工作

给你的 Agent 一个明确的目标，让它在你在睡觉时运行：

```bash
aios harness run \
  --objective "重构认证模块并编写集成测试" \
  --worktree \
  --max-iterations 20
```

随时检查进度：

```bash
aios harness status --session <session-name> --json
```

### 在 Agent 内部使用路由快捷方式

当你在运行中的 Agent 内部时，可以用快捷方式触发 Harness CLI 功能：

| 快捷方式 | 功能 |
|---|---|
| `/single <任务>` | 在当前 Agent 中处理任务 |
| `/team <任务>` | 分发给多个 Agent |
| `/harness <任务>` | 作为长时间通宵运行 |

!!! note "客户端差异"
    - **Claude Code / Gemini / OpenCode**：`/single`、`/team`、`/harness`
    - **Codex**：`/prompts:single`、`/prompts:team`、`/prompts:harness`

    如果快捷方式丢失了，运行 `aios doctor --native --fix`。

---

## 常见问题

### Harness CLI 会取代我的编码 Agent 吗？

**不会。** 你仍然运行 `codex`、`claude`、`gemini` 或 `opencode`。Harness CLI 在它们之上添加了记忆、技能和团队协作。

### 为什么需要 `.contextdb-enable`？

这是一个选择加入开关。没有它，Harness CLI 不会记录任何内容。你选择哪些项目拥有记忆。

### 我的 Agent 会共享相同的记忆吗？

**是的。** 如果你在同一个项目文件夹中先运行 `codex` 然后运行 `claude`，它们共享相同的 ContextDB。这意味着 Claude 知道 Codex 之前做了什么。

### 我需要一次学会所有东西吗？

**不需要。** 第一天你需要的三件事是：

1. `aios` — 用于设置和诊断
2. `touch .contextdb-enable` — 打开记忆
3. `codex`（或 `claude`/`gemini`）— 开始编码

其他一切 — 团队、harness、memo、superpowers — 你可以根据需要学习。

### 如何更新？

```bash
aios
# 然后从菜单中选择 "Update"
```

### 如何卸载？

```bash
aios uninstall --components shell,skills,native
```

## 下一步去哪里

- [ContextDB](contextdb.md) — 了解记忆如何在幕后工作
- [多 Agent 实战](team-ops.md) — 并行运行多个 Agent
- [单 Agent 夜跑](solo-harness.md) — 让 Agent 通宵工作
- [按场景找命令](use-cases.md) — 按任务组织的命令参考
- [故障排查](troubleshooting.md) — 修复常见问题
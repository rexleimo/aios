---
title: 按场景找命令
description: 不先背概念，直接按“我想做什么”选择 Harness CLI 命令。
---

# 按场景找命令

这页只回答一个问题：**我现在应该敲哪条命令？**

<figure class="rex-visual">
  <img src="../assets/visual-contextdb-memory-loop.svg" alt="ContextDB 项目记忆循环：创建 .contextdb-enable 后，codex、claude、gemini 共享本地项目记忆">
  <figcaption>大多数场景都围绕同一个核心：在项目根目录开启 ContextDB，之后不同 CLI 都能接上同一份本地上下文。</figcaption>
</figure>

## 我想安装并检查环境

```bash
aios
```

进入 TUI 后按顺序执行：

1. **Setup**：安装 shell 包装、skills、browser 等组件。
2. **Doctor**：检查 Node、MCP、skills、native 配置。
3. **Update**：以后升级也优先从这里走。

命令行方式：

```bash
aios setup --components all --mode opt-in --client all
aios doctor --native --verbose
```

## 我想让 agent 记住当前项目

```bash
cd /path/to/project
touch .contextdb-enable
codex
```

之后在同一项目里运行 `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok`，都会接入同一个 ContextDB。

## 我想要可持续的操作记忆（Memo + Persona）

如果你希望在 CLI 里快速记录长期偏好/项目约束，用 `aios memo`：

```bash
aios memo add "Need strict pre-PR checks #quality"
aios memo pin add "Avoid destructive git commands."
aios memo recall "quality gate" --limit 5
aios memo storage status
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user add "Preferred language: zh-CN + technical English terms"
```

记忆分层规则：

- `memo add/search/recall` -> 规范 `.aios/memo` 存储（仅为兼容性镜像 legacy ContextDB）
- `memo pin` -> 规范 `.aios/memo` pinned 文件（仅为兼容性镜像 legacy workspace-memory）
- `memo persona/user` -> 全局身份文件，会注入 `ctx-agent` 的 Memory prelude

默认 storage 是 `file`（`.aios/memo/file/events.jsonl`）。只有想要一条 memo 一个 JSON 文件时，才用 `aios memo storage use split`。`storage rebuild` 只全量重建派生查询文件。

Persona 用来描述 agent 基线（“这个 AI 应该怎么工作”），User profile 用来描述用户稳定偏好（“这个用户希望怎么交付”）。两者注入前都会经过安全扫描和容量限制。

## 我想跨 CLI 接力

```bash
claude   # 先分析
codex    # 再实现
gemini   # 最后复查或对比
```

只要都在同一个项目目录里，ContextDB 会保存事件和 checkpoint，降低“换工具就丢上下文”的概率。

## 我想让一个 agent 自己过夜跑

适合：目标明确、只需要一个 provider、希望夜里持续推进，而且没必要拆成并行 worker。

```bash
aios harness run --objective "整理明早交接清单" --session nightly-demo --worktree --max-iterations 20
aios harness status --session nightly-demo --json
aios hud --session nightly-demo --json
```

如果你想让它停在安全边界，或者第二天继续：

```bash
aios harness stop --session nightly-demo --reason "白天人工接手"
aios harness resume --session nightly-demo
```

如果你需要 lifecycle hook 证据，可显式指定：

```bash
aios harness run --objective "整理明早交接清单" --session nightly-demo --hooks
aios harness resume --session nightly-demo --no-hooks
```

如果你要的是“一个 agent 盯一个目标持续做”，用 [单 Agent 夜跑](solo-harness.md)。如果任务本身适合并行拆分，再用 [多 Agent 实战](team-ops.md)。

提示：如果你是从包装后的 `codex` / `claude` / `gemini` / `opencode` / `hermes` / `grok` 开始，并明确提出过夜/可恢复任务，启动路由提示会让 agent 自己触发同样的 `aios harness run ... --workspace <project-root>` 命令，不需要你手动记。

## 我想开多 Agent

适合：模块独立、任务可以拆、你能接受 token 成本。

```bash
# Dry-run 预览（安全，不调用模型）
aios team 3:codex "实现 X，完成前运行测试并总结改动"

# Live GroupChat 执行（基于轮次，共享对话）
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli aios team 3:codex "实现 X"

# 监控进度
aios team status --provider codex --watch
```

在 live 模式下，Agent Team 使用 **GroupChat Runtime**：agent 在轮次中运行，共享同一个对话线程。Planner 分析任务，implementer 按轮次并行工作，reviewer 验证。被阻塞的 agent 会触发自动 re-plan 轮次。

当你新增 agent、修改路由或更新 workflow skill 时，先记录治理证据再信任 live 运行：

```bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

不适合：需求还模糊、单点 bug、多个 worker 会改同一个文件。此时先用普通 `codex`。

## 我想看进度和历史

```bash
aios hud --provider codex
aios team status --provider codex --watch
aios team history --provider codex --limit 20
```

如果只想快速看最近失败：

```bash
aios team history --provider codex --quality-failed-only
```

## 我想让任务有质量门禁

```bash
aios quality-gate pre-pr --profile strict
```

适合提交 PR 前或大改后跑一遍。它会把 ContextDB、native/sync、release health 等检查纳入门禁。

如果你想直接看 RL 发布门禁状态和趋势：

```bash
aios release-status --recent 12
aios release-status --strict
```

## 我想让 Harness CLI 分阶段编排

先预览，不调用模型：

```bash
aios orchestrate feature --task "Ship X" --dispatch local --execute dry-run
```

确认要 live 执行时再显式打开：

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli
aios orchestrate --session <session-id> --dispatch local --execute live
```

新用户优先用 `aios team ...`。`orchestrate live` 更适合已经理解 session、plan、preflight 的维护者。

对于聚焦单点修改的任务，可使用 `bugfix` blueprint（3 轮：plan → implement → review）：

```bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "修复 X" --execute live --preflight none
```

## 我想排查浏览器自动化

```bash
aios internal browser doctor --fix
aios internal browser cdp-status
```

如果页面操作失败，先看 [故障排查](troubleshooting.md)，不要直接重装全部组件。

## 我想保护密钥和配置

```bash
aios privacy read --file .env
```

不要把 `.env`、cookies、token、浏览器 profile 原样贴给模型。Harness CLI 的 Privacy Guard 会尽量在读取前脱敏。

## 选择口诀

- **日常开发**：`codex` / `claude` / `gemini` / `opencode` / `hermes` / `grok`
- **安装更新**：`aios`
- **单 Agent 夜跑**：`aios harness run --objective "整理明早交接清单" --worktree`
- **多 Agent（GroupChat）**：`aios team 3:codex "任务"`（基于轮次的共享对话）
- **看进度**：`aios team status --watch`
- **交付前检查**：`aios quality-gate pre-pr --profile strict`
- **浏览器问题**：`aios internal browser doctor --fix`

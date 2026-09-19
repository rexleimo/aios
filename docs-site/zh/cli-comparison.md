---
title: CLI 对比
description: "对比原生 Codex / Claude / Gemini CLI 工作流与 AIOS 编排层的真实差别：原生 CLI 需要手动管理记忆、路由与验证，AIOS 让你用一句话描述目标，上下文、分工与验收由它负责，最终交付可复核的证据与结果，避免黑箱操作。"
---

# 原生 CLI vs AIOS 层

> **快速答案：** 一次性、低风险的小任务可以直接使用 `codex`、`claude`、`gemini` 或 `opencode`。当任务需要跨会话记忆、工作流路由、多客户端交接、浏览器安全或验证证据时，再加上 AIOS。它是本地工作流能力层，不会替换你的 coding agent。

## 先看决策

| 需求 | 推荐路径 |
| --- | --- |
| 没有持久状态的短任务 | 原生 CLI |
| 共享项目记忆和可检索上下文 | AIOS + ContextDB |
| 多客户端或多 Agent 协作 | AIOS + Agent Team |
| 需要安全门禁和完成证据的修改 | AIOS + 编辑/验证门禁 |

AIOS 不是 Codex、Claude 或 Gemini CLI 的替代品。
它是它们之上的可靠性层。

[在 GitHub 上 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[快速开始](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[案例集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## AIOS 改变了什么

| 工作流需求 | 仅用原生 CLI | 使用 AIOS 层 |
|---|---|---|
| 跨会话记忆 | 手动复制粘贴上下文 | 项目 ContextDB 默认恢复 |
| 跨 agent 接力 | 临时且脆弱 | 共享 session/checkpoint 工件 |
| 浏览器自动化 | 工具逐一配置漂移 | 统一 MCP 安装 + doctor 脚本 |
| 敏感配置读取安全 | 容易将密钥泄露到 prompts | Privacy Guard 脱敏路径 |
| 操作恢复 | 手动排查 | Doctor 脚本 + 可复现 runbook |

## 支持的客户端

目前是十个。下表就是注册表实际暴露的能力矩阵（源头是 `scripts/lib/clients/core/definitions.mjs`），自己这个安装支持到什么程度，用 `aios doctor --native --verbose` 查，不要靠假设。

| 客户端 | 命令 | skills | native | harness | agents | team | 指令文件 | 项目技能目录 |
|---|---|---|---|---|---|---|---|---|
| Codex CLI | `codex` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.codex/skills` |
| Claude Code | `claude` | ✓ | ✓ | ✓ | ✓ | ✓ | `CLAUDE.md` | `.claude/skills` |
| Gemini CLI | `gemini` | ✓ | ✓ | ✓ | — | ✓ | `GEMINI.md` | `.gemini/skills` |
| OpenCode | `opencode` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.opencode/skills` |
| Hermes | `hermes` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.hermes/skills` |
| Grok Build | `grok` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.grok/skills` |
| WorkBuddy | `codebuddy` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.workbuddy/skills` |
| Pi | `pi` | ✓ | ✓ | ✓ | — | ✓ | `AGENTS.md` | `.agents/skills`（共享根） |
| ZCode | `zcode` | ✓ | ✓ | ✓ | 插件 | ✓ | `AGENTS.md` | `.agents/skills`（共享根） |
| Qoder | `qoder` | ✓ | ✓ | ✓ | — | ✓ | `AGENTS.md` | `.qoder/skills` |

列含义：**skills** 把技能包投影到客户端技能目录 · **native** 写入客户端原生指令文件 · **harness** solo-harness 驱动 · **agents** 项目级子代理定义 · **team** `aios team` 并行派发。

四行需要脚注：

- **ZCode 的 `agents` 不是缺失项。** ZCode 0.16.5 没有项目级子代理定义面，所以 AIOS 把 rex 角色卡物化成 `~/.aios/zcode-plugin` 下的 `aios-agents` inline plugin，并通过用户级 `plugins.dirs` 注册；`doctor:zcode-agents` 会报告 manifest 有效性、agent 漂移和注册状态。ZCode 也没有 `--model` 参数，因此那里模型路由保持为空，headless 运行需要一次性 `zcode login`。
- **Pi 和 ZCode 共用 `.agents/skills` 根**，不再生成私有副本，升级时会成对清理旧目录。
- **Pi 的 `agents` 是上游边界；`team` 现在已经验证过了。** Pi 官方文档写明了它“有意不包含内置 MCP、子代理、权限弹窗、plan mode”——子代理需要你自己写成 extension，所以根本没有项目级定义面可供 AIOS 物化 rex 角色卡（AIOS 工具是靠 `aios-bridge` MCP server 加 Pi extension 桥进去的，不走 config migration）。但 `team` 不需要那种定义面：team worker 就是一个 headless 的 `pi -p` 子进程，跟其他 provider 走同一套 spawn 路由，并且已经在真实的 `aios team --provider pi --live` 批次里跑通（plan 阶段完整完成，implement worker 确实写出了目标文件），离线则由 `scripts/tests/team-pi-worker.test.mjs` 守住。Pi 另外支持长驻的 `--transport rpc` 会话驱动 solo harness。请把这张表读成“已验证”，而不是“做不到”——用 `aios doctor --native --verbose` 看你这个安装实际有什么。
- **Qoder 的 `agents` 与 Pi、ZCode 是同一条边界。** Qoder（阿里巴巴）是 AI IDE 加编码 Agent CLI：命令 `qoder`，运行时客户端 id 是 `qoder-cli`；国内发行版带的是 `qoderclicn`，主目录 `~/.qoder-cn`（国际版是 `~/.qoder`，可用环境变量 `QODER_HOME` 覆盖）。它同样没有项目级子代理定义面，所以 AIOS 认领 `skills` / `native` / `team` / `harness`，`agents` 先不声明。`team` 与 `harness` 能跑，是因为 Qoder 支持无人值守：`-p` print 模式配 `--output-format`，再用 `--yolo`——这正是 spawn 路由驱动其他 provider 时用的同一套 headless 面。模型路由是 `own`：模型绑定账号、用交互式 `/model` 选择，没有验证过的 headless `--model` 参数，所以 AIOS 暂时不会向 Qoder 转发模型（与 zcode、grok、workbuddy 同一状态）。AIOS 把技能投影进 Qoder 自己的 `.qoder/skills`（用户级 `~/.qoder/skills`），MCP 条目写进 `~/.qoder/settings.json` 与 `<repo>/.qoder/settings.json` 的顶层 `mcpServers` 命名空间，指令落在 `AGENTS.md`——也就是与 codex / opencode / grok / hermes / workbuddy / pi / zcode 合写的那个原生投影文件（`QODER.md` 是它接受但 AIOS 不写的别名）。Qoder 支持随 AIOS 5.20.0 发布。

单个客户端投影用 `aios init --agent <client>`（例如 `aios init --agent qoder`），全部则用 `--agent all`；`qoder` 在 `PATH` 上时也会被自动探测到，不必显式指定。

## 何时仅用原生 CLI

- 你需要一个没有接力的临时短任务。
- 你不需要会话持久性或工作流可追溯性。
- 你在一次性环境中实验。

## 何时添加 AIOS

- 你在同一个项目中切换使用 `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok`（Grok Build）、`workbuddy`（CodeBuddy CLI）、`pi`、`zcode` 或 `qoder`（Qoder CLI，国内发行版为 `qoderclicn`）。
- 你需要重启安全的上下文和可审计的 checkpoint。
- 你需要浏览器自动化和认证墙处理，且有明确的人工交接。
- 你必须减少配置读取期间的意外密钥暴露。

## 快速验证（5 分钟）

```bash
git clone https://github.com/rexleimo/aios.git
cd aios
scripts/setup-all.sh --components all --mode opt-in
source ~/.zshrc
codex
```

然后验证持久化工件存在：

```bash
ls .aios/context-db
```

预期结果：`sessions/`、`index/`、`exports/`。

## 深度案例

- [案例：跨 CLI 接力](case-cross-cli-handoff.md)
- [案例：浏览器认证墙流程](case-auth-wall-browser.md)
- [案例：Privacy Guard 配置读取](case-privacy-guard.md)

## 下一步

[在 GitHub 上 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }

## 常见问题

### AIOS 会替换我的 coding agent 吗？

不会。它在支持的客户端外层提供本地工作流、记忆和验证能力。

### 什么时候原生 CLI 更合适？

任务小、无状态、低风险，并且额外的项目上下文不会改善结果时，直接使用原生 CLI 更简单。

## 官方文档

当前行为请继续阅读[工作流策略](workflow-policy.md)、[ContextDB](contextdb.md)和[快速开始](getting-started.md)。

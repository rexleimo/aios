---
title: "RexCli Skills 安装体验更新：全局/项目范围、更清晰的选择器"
description: "RexCli 本次更新不只重做了 skills 安装与卸载体验，也把仓库内 skill 主源收口到 skill-sources/，默认安装模式改成可移植 copy，并把 Node 运行基线统一到 22 LTS。"
date: 2026-03-17
tags: [RexCli, Skills, TUI, Onboarding, AI Development]
---

# RexCli Skills 安装体验更新：全局/项目范围、更清晰的选择器

这次迭代主要围绕两个实际问题展开：

1. 并不是所有 skills 都适合默认出现在每个项目里，尤其是带有明显业务语义或项目语义的技能。
2. 仓库里的 skills 既充当"源文件"，又充当"安装目标"，会让跨机器、跨项目同步越来越难维护。

为了解决这两个问题，RexCli 对 `skills` 的安装、卸载、同步和仓库内存放方式做了一轮收敛，让以下几类内容之间的边界都更清楚：

- 系统核心能力
- 按需扩展能力
- canonical source tree
- 生成产物

## Canonical source tree 改成 `skill-sources/`

现在仓库内 skill 的主源目录不再是 `.codex/skills` 或 `.claude/skills`。

新的约定是：

- `skill-sources/` 是 canonical source tree
- `.codex/skills`、`.claude/skills`、`.agents/skills`、`.gemini/skills`、`.opencode/skills` 是生成出来的兼容目录
- repo 内这些兼容目录由 `node scripts/sync-skills.mjs` 统一写入和更新

这意味着以后跨电脑、跨项目拷贝 skill 时，应该以 `skill-sources/` 为主，而不是把某个 client 的 discoverable 目录当作源文件夹继续复制。

同时，`node scripts/check-skills-sync.mjs` 现在会作为 release preflight 的一部分，确保仓库里生成目录和 canonical source tree 没有漂移。

## 支持 global / project 两种安装范围

现在安装 `skills` 时，用户可以显式选择安装范围：

- `global`：安装到用户全局目录，例如 `~/.codex/skills`
- `project`：安装到当前执行命令时所在的项目目录，也就是当前 `pwd`

这意味着你可以把通用方法论和系统型 skills 安装到全局，同时把强业务耦合、强项目耦合的 skills 安装到某个具体项目里，而不是默认污染所有仓库。

## 改成 catalog 驱动，而不是"扫到什么装什么"

现在 skills 安装更偏"可控目录 + 明确选择"，而不是"扫描目录就默认安装"。

核心价值是：

- 减少不必要的默认污染
- 更清晰的"装了什么、为什么装"
- 更安全的新项目 onboarding

## 相关链接

- Docs: `/superpowers/`
- Repo: <https://github.com/rexleimo/harness-cli>

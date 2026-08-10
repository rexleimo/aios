---
title: "v2.0.2：更安全的技能健康记录与更干净的 Crush 配置"
description: "AIOS v2.0.2 强化技能健康遥测，修复新增 CLI 入口的 help 路由，并从仓库中移除 tracked Crush 配置文件。"
date: 2026-06-15
tags: ["release", "CLI", "skills", "Crush", "configuration"]
---

# v2.0.2：更安全的技能健康记录与更干净的 Crush 配置

v2.0.2 是一个小版本，但主题很明确：让本地 agent 状态更可信、更容易发现，也不要把本机配置混进仓库。

## 技能健康记录现在拒绝未知 status

过去 `recordSkillObservation()` 会把所有非 `success` 的值归一化成 `failure`。这看起来保守，但会隐藏上游生产者的 bug：一个拼写错误、旧值或未来枚举，都可能悄悄抬高失败率。

现在写入端只接受：

- `success`
- `failure`

其他值会在落盘前直接抛错。这样 `.aios/skill-health/observations.jsonl` 仍然是可信的遥测流，而不是坏数据的收集桶。

## Help 标志优先于位置参数校验

新增的 `skill` 和 `session` parser 现在会先处理 help，再检查必填 subcommand 或 path。下面这些命令会展示 usage，而不是报缺参数错误：

```bash
node scripts/aios.mjs skill --help
node scripts/aios.mjs skill comply --help
node scripts/aios.mjs session --help
node scripts/aios.mjs session changed-files --help
```

这对恢复很重要：当人或 agent 进入新的命令面时，`--help` 必须始终是逃生出口。

## Crush 配置离开仓库

`.crush.json` 和 `crush.json` 已从 git tracking 中移除，并加入 `.gitignore`。

AIOS 仍支持在工作区需要 Crush MCP wiring 时生成或读取本地 Crush 配置。变化只在所有权：本地工具配置属于机器，不应该进入共享仓库历史。

## 验证

此版本补了两类回归测试：

- 无效 skill health status 会在写入前被拒绝
- `skill` 与 `session` 的 help 标志会绕过位置参数校验

发布验证还会重新构建 docs 与 blog site，确保生成的网站与源内容一致。

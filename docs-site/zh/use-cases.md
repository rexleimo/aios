---
title: 按场景找命令：选择 Harness CLI 路径
description: 按记忆、搜索、并行工作、可恢复运行、浏览器、隐私和验证目标选择 Harness CLI 命令。
---

# 按场景找命令

## 一句话回答

根据当前工作选择命令：安装用 aios init 和 doctor，项目事实用 memo 和统一搜索，独立工作用 aios team，一个长目标用 aios harness，按顺序执行阶段用 aios orchestrate。路径不确定时先看[工作流策略](workflow-policy.md)。

## 先完成初始化

~~~bash
aios init --all
aios doctor --native --verbose
~~~

在项目根目录执行。标记指向 .aios/context-db/index.json，ContextDB 会按需召回相关来源。

## 选择路径

| 我想要... | 使用 |
| --- | --- |
| 提问或检查，不修改文件 | direct |
| 做一个小而清晰的本地改动 | guarded |
| 协调多步骤或可恢复目标 | planned / Solo Harness |
| 拆分独立工作包 | Agent Team |
| 按顺序执行并带门禁 | Orchestrate |
| 先理解决策规则 | [工作流策略](workflow-policy.md) |

## 项目记忆和搜索

~~~bash
aios memo add "保持认证测试严格"
aios memo search "认证"
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

ContextDB 在本地保存项目 session、检查点、导出文件和规范 memo。统一搜索可以在大范围读取前搜索 memory、plans、docs 和 code。

## 跨客户端交接

当集成已同步时，可以在同一项目运行受支持客户端：

~~~bash
claude
codex
gemini
~~~

重要决策使用显式 memo 和 checkpoint。共享项目存储不等于每个客户端拥有相同路由或 MCP 支持，请用 aios doctor 确认。

## 一个长目标

~~~bash
aios harness run \
  --objective "起草明天的交接" \
  --session nightly-demo \
  --worktree \
  --max-iterations 20
aios harness status --session nightly-demo --json
aios harness stop --session nightly-demo --reason "早间审查"
aios harness resume --session nightly-demo
~~~

完整生命周期见 [Solo Harness](solo-harness.md)。dry run 只创建本地日志状态，不测试供应商。

## 独立并行工作

只有文件和所有权独立时才启动 Team：

~~~bash
aios team --provider codex --workers 3 --task "实现 X 并更新测试" --dry-run --json
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "实现 X 并更新测试"
aios team status --provider codex --watch
~~~

治理、历史、阻塞恢复和证据见 [Agent Team](team-ops.md)。

## 分阶段编排

先预览 blueprint：

~~~bash
aios orchestrate bugfix --task "修复 X" --dispatch local --execute dry-run
~~~

通过 preflight 和供应商检查后再启用 live：

~~~bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "修复 X" --execute live --preflight none
~~~

当阶段顺序和质量门禁比并行数量更重要时使用 Orchestrate。dry-run 不是实时供应商测试。

## 浏览器自动化

默认文档路径是 browser-use MCP over CDP：

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

交互式浏览器工作先启动可见 CDP 浏览器、连接、读取 semantic snapshot 或定向文本，再执行并验证。认证墙保留人工控制。Playwright MCP 是兼容路径。

## 保护敏感信息

~~~bash
aios privacy read --file .env
aios privacy status
~~~

不要把 .env、cookie、token、私钥或浏览器 profile 粘贴给模型。脱敏是边界检查，不是分享所有文件的许可。

## 交付前验证

~~~bash
aios quality-gate pre-pr --profile strict
aios doctor --native --verbose
npm run test:scripts
~~~

同时运行项目自己的定向测试。状态行或 dry-run 输出不能替代真正证明结论的命令。

## 下一步

- [工作流策略](workflow-policy.md) - 路由语义和继续规则。
- [ContextDB](contextdb.md) - 记忆和统一搜索。
- [Agent Team](team-ops.md) - 并行操作。
- [Solo Harness](solo-harness.md) - 可恢复操作。
- [故障排查](troubleshooting.md) - 按症状恢复。

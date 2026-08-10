---
title: 案例库：可复现的 AIOS 工作流
description: 用证据优先的案例完成初始化、跨客户端交接、浏览器认证、隐私读取和发布验证。
---

# 案例库

## 一句话回答

当你需要具体工作流而不是功能介绍时，使用这些案例。每个案例都说明前置条件、命令、预期证据和仍需人工做出的决定。选择最接近目标的案例，再阅读它链接的规范页面。

## 案例 1：初始化新项目

**目标：** 创建当前项目标记并验证原生集成。

前置条件：Node.js 24 LTS、Git、受支持客户端和项目根目录。

~~~bash
cd /path/to/project
aios init --all
aios doctor --native --verbose
test -f .aios/context-db/index.json
~~~

预期证据：doctor 报告实际客户端检查，注册表标记存在。人工决定：确认项目根目录正确，再允许记忆或配置变化。

规范页面：[快速开始](getting-started.md)、[ContextDB](contextdb.md)。

## 案例 2：跨客户端交接

**目标：** 在一个客户端分析，在另一个客户端实现，并保留决策轨迹。

~~~bash
aios memo add "auth API 保持不变"
claude
codex
node scripts/aios.mjs search "auth API" --agent codex-cli --json
~~~

预期证据：统一搜索找到 memo 或 checkpoint，每个客户端通过自己的 doctor 检查。人工决定：分享工作前检查变更文件和供应商边界。

详见[跨 CLI 交接案例](case-cross-cli-handoff.md)。

## 案例 3：浏览器 CDP 冒烟

**目标：** 验证 browser-use MCP 默认路径可用。

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

预期证据：报告浏览器 profile 和 CDP 状态。交互式运行时启动可见 CDP 浏览器，连接，读取 semantic snapshot，执行一个有边界的动作，再验证页面状态。认证墙由人工处理。

详见[浏览器认证墙案例](case-auth-wall-browser.md)。

## 案例 4：隐私安全读取配置

**目标：** 读取配置文件而不暴露原始秘密。

~~~bash
aios privacy status
aios privacy read --file .env
~~~

预期证据：输出按照本地隐私边界完成脱敏。人工决定：检查脱敏结果，决定剩余字段是否可以分享。不要粘贴原始 cookie、token、私钥或浏览器 profile。

详见[Privacy Guard 案例](case-privacy-guard.md)。

## 案例 5：Team 治理冒烟

**目标：** 在 live Team 前验证 Agent 表面。

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

预期证据：smoke、provenance 和 training 产物写入 .aios/agents/ 与 .aios/interception/metrics/。人工决定：确认供应商、客户端和变更 skill 适合 live 工作。

规范页面：[Agent Team](team-ops.md)。

## 案例 6：可恢复长任务

**目标：** 用可审查日志运行一个明确目标。

~~~bash
aios harness run \
  --objective "准备发布交接" \
  --session release-handoff \
  --worktree \
  --max-iterations 20
aios harness status --session release-handoff --json
aios harness stop --session release-handoff --reason "检查点审查"
aios harness resume --session release-handoff
~~~

预期证据：status、检查点和 iteration 产物标明当前阶段。人工决定：合并前检查 worktree diff 和测试。

规范页面：[Solo Harness](solo-harness.md)。

## 案例 7：dry-run 与 live 的区别

**目标：** 区分本地计划验证和供应商执行。

~~~bash
aios team --provider codex --workers 2 --task "审查发布清单" --dry-run --json
aios orchestrate bugfix --task "修复发布检查" --dispatch local --execute dry-run
~~~

预期证据：没有模型调用，但产生本地 dispatch 和日志状态。人工决定：确认供应商、凭据、worktree 和验证范围后再启用 live。

## 案例 8：发布验证

**目标：** 发布变更前收集证据。

~~~bash
aios doctor --native --verbose
aios quality-gate pre-pr --profile strict
npm run test:scripts
git diff --check
~~~

预期证据：每条命令成功，或指出具体阻塞。人工决定：发布前复查声明、链接、隐私边界和生成输出。

## 提交新案例

有用的案例应包含：

- 一个用户意图和一个主要动作；
- 精确命令和前置条件；
- 预期状态、文件或测试证据；
- 人机协同边界；
- 一个规范文档链接和一个相关案例。

不要包含凭据、cookie、私有路径或未脱敏的供应商输出。

## 下一步

- [按场景找命令](use-cases.md)
- [故障排查](troubleshooting.md)
- [工作流策略](workflow-policy.md)

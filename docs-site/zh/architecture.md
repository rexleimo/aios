---
title: 架构
description: wrapper、runner 与 ContextDB 的运行关系。
---

# 架构

## 组件

- `scripts/contextdb-shell.zsh`：接管 `codex/claude/gemini`
- `scripts/contextdb-shell-bridge.mjs`：包裹/透传决策桥
- `scripts/ctx-agent.mjs`：统一运行器
- `mcp-server/src/contextdb/*`：ContextDB 核心与 CLI

## 运行链路

```text
用户命令
  -> zsh wrapper
  -> contextdb-shell-bridge.mjs
  -> ctx-agent.mjs
  -> contextdb CLI
  -> 启动原生 CLI（注入 context）
```

## 存储模型

每个被包装的工作区有独立的本地存储（git 根目录，如无则为当前目录）：

```text
.aios/context-db/
  manifest.json
  index/sessions.jsonl
  sessions/<session_id>/
  exports/<session_id>-context.md
```

## 作用域控制

- `all`：所有工作区启用，包括非 git 目录
- `repo-only`：仅 `ROOTPATH` 工作区启用
- `opt-in`：仅含 `.contextdb-enable` 的工作区启用
- `off`：关闭包装

如果需要严格按项目控制，使用 `opt-in`。

## Harness 层（AIOS）

AIOS 在 ContextDB 之上提供面向运营的 harness：

- `aios orchestrate` 基于蓝图生成本地调度 DAG。
- `dry-run` 使用 `local-dry-run`（免 token，本地模拟）。
- `live` 使用 `subagent-runtime`，通过外部 CLI（`codex`）执行各阶段任务（当前仅支持 codex-cli）。
- 当 `AIOS_SUBAGENT_CLIENT=codex-cli` 时，AIOS 会优先使用 `codex exec` 的结构化输出（`--output-schema`、`--output-last-message`、stdin）生成稳定的 JSON handoff（旧版本自动降级）。

`live` 默认关闭，需要显式打开：

- `AIOS_EXECUTE_LIVE=1`
- `AIOS_SUBAGENT_CLIENT=codex-cli`

### Browser MCP（browser-use CDP）

自 2026-04-10 起，默认浏览器 MCP 运行时为 **browser-use MCP over CDP**：

- 启动器：`scripts/run-browser-use-mcp.sh`
- 迁移命令：`aios internal browser mcp-migrate`
- 工具：`chrome.launch_cdp`、`browser.connect_cdp`、`page.*`、`diagnostics.sannysoft`
- Profile 配置：`config/browser-profiles.json`
- 截图超时保护：`BROWSER_USE_SCREENSHOT_TIMEOUT_MS`（默认：15 秒）

旧版 Playwright MCP（`mcp-server/`）仍保留用于兼容，但不再是默认。

## RL 训练层（AIOS） {#rl-training-layer-aios}

AIOS 包含一个多环境强化学习系统，持续在 shell、浏览器和编排器任务中改进共享的学生策略。

### 共享控制平面（`scripts/lib/rl-core/`）

```
campaign-controller.mjs   # epoch 编排（采集 + 监控）
checkpoint-registry.mjs  # active / pre_update_ref / last_stable 血统追踪
comparison-engine.mjs     # better / same / worse / comparison_failed
control-state-store.mjs  # 重启安全的控制快照
epoch-ledger.mjs         # epoch 状态 + 降级 streak
replay-pool.mjs          # 四车道路由（positive/neutral/negative/diagnostic）
reward-engine.mjs        # 环境 reward + teacher 塑形融合
teacher-gateway.mjs      # 来自 Codex/Claude/Gemini/opencode 的标准化输出
schema.mjs               # 共享契约验证
trainer.mjs              # PPO 入口（online + offline）
```

### 环境适配器

| 适配器 | 路径 | 训练重点 |
|---------|------|------------|
| Shell RL | `scripts/lib/rl-shell-v1/` | 合成 bugfix 任务 → 真实仓库 |
| Browser RL | `scripts/lib/rl-browser-v1/` | 受控真实网页流程 |
| Orchestrator RL | `scripts/lib/rl-orchestrator-v1/` | 高价值控制决策 |
| Mixed RL | `scripts/lib/rl-mixed-v1/` | 跨环境联合训练 |

### 核心 RL 概念

- **Episode contract**：统一结构化输出，跨所有环境（taskId, trajectory, outcome, reward, comparison）
- **三指针 checkpoint 血统**：`active` → `pre_update_ref` → `last_stable`，降级时自动回滚
- **四车道 replay pool**：positive / neutral / negative / diagnostic_only — 按比较结果确定性路由
- **Teacher gateway**：来自 Codex CLI、Claude Code、Gemini CLI 和 OpenCode 的标准化信号

### 运行 RL

```bash
# Shell RL 流程
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval

# 混合环境 campaign
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
```

### RL 状态

- RL Core：稳定（40+ 测试）
- Shell RL V1：稳定（Phase 1–3）
- Browser RL V1：beta
- Orchestrator RL V1：beta
- Mixed RL：实验性（端到端已验证）

---
title: "Model Router: Balanced Multi-Model Dispatch for Agent Teams"
description: "Balanced v2 routes sub-tasks with weighted signals, profiles, and explainable output so subscribed models are used when they are actually the right tool."
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "orchestration", "dispatch", "AIOS"]
---

# Model Router: Balanced Multi-Model Dispatch for Agent Teams

Every coding agent has a different shape. Claude Opus is strong for review and architecture. DeepSeek-V4 is cheap and fast for ordinary implementation. Gemini-3-Pro handles long documents. GPT-5.5 is the all-rounder you want for browser and computer-use flows. Kimi K2.6 is a better fit for frontend UI. MiniMax-M2.7 is built for self-healing operations.

The hard part is not knowing that list once. The hard part is routing real messy task descriptions correctly every time.

Balanced Model Router v2 upgrades the dispatch layer from first-match keywords to weighted task signals, routing profiles, and explainable output.

## Why Balanced v2

The old failure mode was easy to spot in stats: too many tasks collapsed into `implementation -> deepseek-v4`. That is fine for a normal endpoint, but wrong for browser publishing, frontend polish, or production recovery.

Balanced v2 keeps DeepSeek for ordinary coding while upgrading when the prompt contains strong capability signals.

| Task | Before | Balanced v2 |
|------|--------|-------------|
| `用浏览器打开小红书发布页面，上传图片并填写标题` | `implementation -> deepseek-v4` | `browser-automation -> gpt-5.5` |
| `build a beautiful landing page component` | `implementation -> deepseek-v4` | `frontend -> kimi-k2.6` |
| `修复线上登录故障并分析日志` | often `research -> gemini-3-pro` | `self-healing -> minimax-m2.7` |
| `阅读一份很长的第三方 API 文档，整理迁移策略` | research | `research -> gemini-3-pro` |
| `实现一个新的登录接口，并补测试` | implementation | `implementation -> deepseek-v4` |

That is the balance: spend on strong models when the task needs them, not because every task sounds important.

## Profiles

Balanced v2 has three routing profiles:

- `balanced`: default. Strong signals upgrade; ordinary implementation stays cost-aware.
- `premium`: broad, risky, or low-confidence work gets a stronger-model bias.
- `budget`: low-cost by default, with upgrades only for hard capability requirements.

```bash
node scripts/aios.mjs model-router route \
  --task "build a beautiful landing page component" \
  --profile balanced \
  --explain
```

You can also set a session default:

```bash
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## Explainable Routing

The best new habit is to use `--explain` before blaming the router.

```bash
node scripts/aios.mjs model-router route \
  --task "用浏览器打开小红书发布页面，上传图片并填写标题" \
  --profile balanced \
  --explain
```

The output includes:

```json
{
  "resolvedType": "browser-automation",
  "modelId": "gpt-5.5",
  "profile": "balanced",
  "confidence": 0.86,
  "matchedSignals": [
    { "taskType": "browser-automation", "signal": "浏览器", "weight": 8 },
    { "taskType": "browser-automation", "signal": "上传", "weight": 8 },
    { "taskType": "browser-automation", "signal": "填写", "weight": 8 }
  ],
  "why": [
    "Detected browser-automation signals: 浏览器, 上传, 填写",
    "balanced profile selected browser-automation"
  ]
}
```

Those fields make the decision debuggable:

- `matchedSignals` shows the words that mattered.
- `confidence` shows how clearly one task type won.
- `why` explains the route in plain language.
- `recommendedPhases` points out compound tasks that should be split.

## Strong Signals

The current signal map is intentionally simple and inspectable:

| Signal examples | Route |
|-----------------|-------|
| browser, upload, screenshot, 浏览器, 上传, 填写 | `browser-automation -> GPT-5.5` |
| security, vulnerability, auth, 安全, 漏洞, 权限 | `security-review -> Claude Opus` |
| code review, pull request, 代码审查, 代码质量 | `code-review -> Claude Opus` |
| production, incident, logs, 线上, 故障, 日志 | `self-healing -> MiniMax-M2.7` |
| architecture, system design, 架构, 跨模块 | `architecture -> Claude Opus` |
| long document, multimodal, 长文档, 第三方 API | `research -> Gemini-3-Pro` |
| frontend, UI, landing page, component, 样式 | `frontend -> Kimi K2.6` |
| implement, develop, 实现, 开发 | `implementation -> DeepSeek-V4` |

This is not a black box. The registry lives in `memory/specs/model-registry.json`, and the router logic lives in `scripts/lib/model-router.mjs`.

## Compound Tasks

A prompt like this is not one job:

```text
设计 model-router 的优化方案并更新 skill 文档和博客
```

Balanced v2 can expose multiple recommended phases, for example planning plus docs. It still returns one `resolvedType` for compatibility, but `recommendedPhases` tells the orchestrator or human operator how to split the work.

That keeps v2 safe: it improves route inspection without silently rewriting team plans.

## CLI Protocols Still Matter

The router also hides provider-specific command syntax:

| Protocol | CLI Template | Used By |
|----------|--------------|---------|
| `codex` | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | GPT-5.5 |
| `gemini` | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| `claude` | `claude --model <model> -p "<prompt>"` | All others |

No more guessing whether a child worker needs `-m`, `--model`, or a provider-specific unattended flag.

## Stats Are Diagnostics, Not Magic

Every live dispatch can be recorded as a ContextDB `model.dispatch` event:

```json
{
  "kind": "model.dispatch",
  "modelId": "claude-opus",
  "taskType": "code-review",
  "success": true,
  "latencyMs": 4500,
  "costEstimate": "high"
}
```

`node scripts/aios.mjs model-router stats` summarizes that history. It is useful for spotting drift, such as every phase being recorded as `deepseek-v4 / implementation`.

But v2 does not yet feed historical success rate back into live scoring. That is a future optimization. Today, routing is determined by task signals, profiles, env overrides, and registry rules.

## Getting Started

```bash
# View all models and routing rules
node scripts/aios.mjs model-router list

# Route with explanation
node scripts/aios.mjs model-router route --task "你的任务描述" --profile balanced --explain

# Force a known task type
node scripts/aios.mjs model-router route --task "重构数据库连接" --task-type implementation

# View recorded dispatch stats
node scripts/aios.mjs model-router stats
```

If subscribed models seem underused, first run the route command with `--explain`. If the task is ordinary implementation, Balanced is doing its job. If the task is browser, frontend, security, architecture, long-doc research, or production recovery, the matched signals should show why it upgrades.

See the [full documentation](https://cli.rexai.top/model-router/) for configuration, routing profiles, and Agent Team integration details.

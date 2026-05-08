---
title: "Model Router: Intelligent Multi-Model Dispatch for Agent Teams"
description: "Introducing the Model Router — an intelligent dispatch layer that matches sub-tasks to optimal models by capability, cost, and historical success rate, with automatic CLI protocol selection."
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "orchestration", "dispatch", "AIOS"]
---

# Model Router: Intelligent Multi-Model Dispatch for Agent Teams

Every coding agent has a different shape. Claude Opus excels at code review and architecture. DeepSeek-V4 is fast and cheap for implementation. Gemini-3-Pro handles 1M-token research documents. GPT-5.5 is the all-rounder that can do anything reasonably well.

But here's the problem: **your orchestrator has to remember which model is best for which task**, and it has to get the CLI command right for each one. `claude --model <name>` vs `codex --yolo -m <name>` vs `gemini -m <name>`. Multiply this by 8 models, 12 task types, and cost-aware fallback chains — it's too much for any human (or agent) to keep straight without tooling.

**Model Router** solves this with a simple dispatch layer that agents can call directly.

## How It Works

The Model Router is a four-step pipeline:

1. **Analyze** — read the sub-task description and match it to a task type (code-review, implementation, research, etc.)
2. **Route** — look up the primary model by capability match, with cost-ascending fallback chain
3. **Dispatch** — generate the correct CLI command for the model's provider (claude/codex/gemini)
4. **Learn** — record the dispatch outcome to ContextDB for historical success-rate feedback

```bash
# Auto-detect task type from description
node scripts/aios.mjs model-router route --task "Review auth.js for security vulnerabilities"
# → security-review → Claude Opus (primary)
# → fallback chain: GPT-5.5 → GLM-5.1

node scripts/aios.mjs model-router route --task "Implement a user login endpoint"
# → implementation → DeepSeek-V4 (primary)
# → fallback chain: GPT-5.5 → Claude Sonnet

node scripts/aios.mjs model-router route --task "Research React 19 migration strategies"
# → research → Gemini-3-Pro (primary)
# → fallback chain: GPT-5.5 → Kimi K2.6
```

## The Model Registry

The router ships with a capability registry covering 8 models:

| Model | Best For | Cost |
|-------|----------|------|
| **Claude Opus 4.7** | Code review, architecture, security audit | Highest |
| **Claude Sonnet 4.6** | Daily dev, RAG, rapid prototyping | Medium |
| **GPT-5.5** | All-rounder: automation, reasoning, general | Highest |
| **DeepSeek-V4-Pro** | Algorithm, core logic, batch processing | Lowest |
| **GLM-5.1** | Math reasoning, autonomous loops, planning | Low |
| **Kimi K2.6** | Multi-agent orchestration, frontend UI | Low |
| **MiniMax-M2.7** | Self-healing, production recovery | Low |
| **Gemini-3-Pro** | Multimodal analysis, long-doc research, 1M context | Medium |

Each model entry includes its CLI protocol — `claude`, `codex`, or `gemini` — so the router always generates the correct command.

## Three CLI Protocols, Automatic Selection

| Protocol | CLI Template | Used By |
|----------|-------------|---------|
| **codex** | `codex --yolo -m <model> -p "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | All others |

No more "was it `-m` or `--model`?" — the router handles it.

## Environment Variable Overrides

Per-role overrides without touching config files:

```bash
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus
```

Or by task type:

```bash
export AIOS_MODEL_CODE_REVIEW=claude-opus
export AIOS_MODEL_RESEARCH=gemini-3-pro
export AIOS_MODEL_GENERAL=gpt-5.5
```

Resolution priority: **env var** > **preferredModel** (agent card) > **model** (fallback).

## Perception Feedback Loop

Every dispatch is recorded as a `model.dispatch` event:

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

Over time, the perception system computes per-task-type model success rates. Future routing decisions weight: **capability match × historical success rate × cost**.

## Agent Integration

The Model Router is injected into agent context via the AIOS Task Router. Any agent running through `ctx-agent` automatically receives model routing guidance. When dispatching sub-tasks, the agent can invoke the `model-router` skill to determine the optimal model.

Agent role cards (`.claude/agents/*.md`) include a `preferredModel` field:

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

## Getting Started

```bash
# View all models and capabilities
node scripts/aios.mjs model-router list

# Route a task to the best model
node scripts/aios.mjs model-router route --task "你的任务描述"

# View dispatch statistics
node scripts/aios.mjs model-router stats
```

The Model Router is available in RexCLI v1.8.0+. See the [full documentation](https://cli.rexai.top/model-router/) for configuration, routing rules, and integration details.

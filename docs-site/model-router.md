---
title: Model Router
description: Automatically pick the right AI model for each task — so you don't have to think about it.
---

# Model Router

> **Quick Answer:** Model Router matches a task to a model using the task type, routing profile, capability registry, and configured fallback rules. Use `--explain` when you need to see why a model was selected; use a profile or explicit override when the default trade-off is not right for the task.

## Start with an explainable route

The safest first command is an explainable route. It shows the selected model and the signals used by the router, so a routing decision can be reviewed instead of treated as magic.

**Different AI models are good at different things.** Model Router automatically sends each task to the model that's best at it.

Frontend work? Use Kimi K2.6. Security review? Use Claude Opus. Browser automation? Use GPT-5.5. You don't need to memorize this — the router figures it out from your task description.

## The Simple Version

```bash
# Route a task to the best model
node scripts/aios.mjs model-router route \
  --task "Build a beautiful landing page component" \
  --explain

# Result: frontend → kimi-k2.6 (because "landing page", "component", "beautiful")
```

That's it. The router reads your task, detects signals, and picks the best model.

## Why This Matters

Without Model Router, you'd need to:

1. Know which model is best for each type of task
2. Manually switch between `codex`, `claude`, and `gemini` commands
3. Remember the right model flags for each CLI

With Model Router, you just describe the task and it handles the rest.

## How It Works

```
Your task description
    ↓
Signal detection (keywords like "browser", "security", "frontend")
    ↓
Task type classification (browser-automation, code-review, etc.)
    ↓
Model selection (based on routing profile)
    ↓
CLI command generation (correct flags for codex/claude/gemini)
    ↓
Execution + outcome recording
```

## CLI Protocol

Three protocols, auto-selected by provider:

| Protocol | CLI | Used by |
|---|---|---|
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | All other models |

Codex live worker defaults to `--dangerously-bypass-approvals-and-sandbox` (equivalent to the old `--yolo` shortcut), avoiding waiting for approval/sandbox prompts in background subprocesses. Only set `AIOS_SUBAGENT_CODEX_UNATTENDED=0` when manually debugging Codex.

## Supported Models

| Model | Best at | Cost |
|---|---|---|
| **Claude Opus 4.7** | Code review, architecture, security | Highest |
| **Claude Sonnet 4.6** | Daily coding, docs, prototyping | Medium |
| **GPT-5.5** | All-rounder, automation, reasoning | Highest |
| **DeepSeek-V4** | Implementation, algorithms, batch work | Lowest |
| **GLM-5.1** | Math, planning, autonomous loops | Low |
| **Kimi K2.6** | Frontend, UI, multi-agent orchestration | Low |
| **MiniMax-M2.7** | Self-healing, production recovery | Low |
| **Gemini-3-Pro** | Research, long documents, multimodal | Medium |

## Task Types & Routing

| You say... | Detected as | Routes to |
|---|---|---|
| "browser", "screenshot", "upload" | browser-automation | GPT-5.5 |
| "security", "vulnerability", "auth" | security-review | Claude Opus |
| "review", "code quality", "PR" | code-review | Claude Opus |
| "frontend", "UI", "landing page", "component" | frontend | Kimi K2.6 |
| "architecture", "system design" | architecture | Claude Opus |
| "long document", "research", "multimodal" | research | Gemini-3-Pro |
| "implement", "develop", regular coding | implementation | DeepSeek-V4 |
| "production", "incident", "self-healing" | self-healing | MiniMax-M2.7 |

## Routing Profiles

Choose how aggressive the routing should be:

| Profile | When to use | Behavior |
|---|---|---|
| `balanced` (default) | Most work | Strong signals upgrade the model; normal coding stays cheap |
| `premium` | Risky or unclear tasks | More willing to use expensive models like Opus or GPT-5.5 |
| `budget` | Cost-sensitive work | Prefers cheap models unless the task really needs a strong one |

```bash
# Use per command
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# Or set for the session
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## Quick Start

### View all models

```bash
node scripts/aios.mjs model-router list
```

### Route a task with explanation

```bash
node scripts/aios.mjs model-router route \
  --task "build a beautiful landing page component" \
  --profile balanced \
  --explain
```

### Force a specific task type

```bash
node scripts/aios.mjs model-router route \
  --task "refactor database connection" \
  --task-type implementation
```

### View dispatch history

```bash
node scripts/aios.mjs model-router stats
```

## Why Was This Model Selected?

Add `--explain` to any route command to see the reasoning:

```json
{
  "resolvedType": "browser-automation",
  "modelId": "gpt-5.5",
  "confidence": 0.86,
  "matchedSignals": [
    { "taskType": "browser-automation", "signal": "browser", "weight": 8 }
  ],
  "why": ["Detected browser-automation signals: browser, upload"]
}
```

- **High confidence** = one task type clearly matched
- **Multiple recommendedPhases** = the task is compound; split it for better routing
- **matchedSignals** shows exactly which keywords triggered the routing

## Overriding Model Selection

If you want to force a specific model:

```bash
# By role
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTER=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus

# By task type
export AIOS_MODEL_BROWSER_AUTOMATION=gpt-5.5
export AIOS_MODEL_CODE_REVIEW=claude-opus

# Disable routing entirely (use a fixed model)
export AIOS_MODEL_ROUTER=0
```

## Configuration Files

| File | Purpose |
|---|---|
| `scripts/lib/specs/model-registry.json` | Model capabilities, routing rules, and CLI protocol settings |
| `scripts/lib/specs/orchestrator-agents.json` | Agent role to `preferredModel` mapping |
| `.claude/skills/model-router/SKILL.md` | Agent-callable self-service routing skill |
| `scripts/lib/model-router.mjs` | Router logic: matching, fallback, CLI construction, and stats |

## Agent Integration

### Guided by Task Routing

Model Router injects agent context through AIOS Task Router. Any agent running under `ctx-agent` automatically receives model dispatch guidance. When dispatching sub-agents, the agent can call the `model-router` skill to determine the optimal model.

### Via Orchestrator

Agent role cards (`.claude/agents/*.md`) contain a `preferredModel` field that the orchestrator automatically resolves when dispatching:

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

Model resolution priority: **environment variable** > **preferredModel** > **model** (fallback).

## Perception Feedback Loop

Each model dispatch is recorded as a `model.dispatch` event in ContextDB. The perception system can calculate model success rate by task type. Future routing decisions will synthesize: **capability match × historical success rate × cost**.

## Common Questions

### Why does everything route to DeepSeek?

Under `balanced` profile, normal implementation tasks go to DeepSeek (it's cheap and good). Use `--profile premium` for tasks where you want stronger models.

### My task has multiple parts and got one model

Compound tasks get one model for now. Check `recommendedPhases` in the explain output — if it shows multiple types, split the work into separate tasks.

### Can I use this with Agent Team?

Yes. Agent Team uses Model Router by default — each phase of the team gets routed to the best model automatically.

## Where To Go Next

- [Agent Team](team-ops.md) — multi-agent collaboration with automatic routing
- [ContextDB](contextdb.md) — project memory
- [Solo Harness](solo-harness.md) — long-running single-agent work

## FAQ

### Does Model Router call a model before it chooses one?

No. The router selects a client/model path from task metadata and configured capabilities. The selected client performs the task afterward.

### Can I override the recommendation?

Yes. Use a routing profile or an explicit role/task override when cost, latency, or capability needs differ from the default.

## Canonical Docs

See [Agent Team](team-ops.md), [Workflow Policy](workflow-policy.md), and [ContextDB](contextdb.md) for the surrounding execution contract.

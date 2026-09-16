---
title: Model Router
description: Automatically pick the right AI model for each task — so you don't have to think about it.
schema_type: techarticle
date: 2026-05-08
---

# Model Router

> **Quick Answer:** Model Router matches a task to a model using the task type, routing profile, capability registry, and configured fallback rules. Use `--explain` when you need to see why a model was selected; use a profile or explicit override when the default trade-off is not right for the task.

## Start with an explainable route

The safest first command is an explainable route. It shows the declared task type, the selected model, and the reason that won, so a routing decision can be reviewed instead of treated as magic.

**Different AI models are good at different things.** Model Router automatically sends each task to the model that's best at it.

Frontend work? Claude Sonnet 5. Security review? Claude Opus 5. Browser automation? GPT-6-Astra. You do not need to memorize this: the caller declares the task type (a phase role, `--task-type`, or your own instruction) and the router resolves model + client.

## The Simple Version

```bash
# Route a task to the best model
node scripts/aios.mjs model-router route \
  --task "Build a beautiful landing page component" \
  --task-type frontend \
  --explain

# Result: frontend -> claude-sonnet-5 (client `claude`, protocol `claude`)
```

That's it. The router resolves the declared task type into a model and a launchable CLI command.

It deliberately does **not** infer task type or intent from free text: keyword guessing is not
reviewable, so `scripts/lib/model-router/signals.mjs` keeps only explicit declarations and falls
back to `general`. Callers that know better (rex phases, team roles, you) say what the task is.

## Why This Matters

Without Model Router, you'd need to:

1. Know which model is best for each type of task
2. Manually switch between `codex`, `claude`, and `gemini` commands
3. Remember the right model flags for each CLI

With Model Router, you just describe the task and it handles the rest.

## How It Works

```
Declared task type (phase role, --task-type, explicit intent)
    ↓
Routing rule lookup (primary model + fallback chain)
    ↓
Profile adjustment (eco / balanced / premium) + role/env override
    ↓
Client contract check (can the launching client speak this model's protocol?)
    ↓
Channel availability check (is that relay channel healthy right now?)
    ↓
CLI command generation (correct --model/-m flag for that client)
    ↓
Execution + outcome recorded back into channel availability
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
| **GPT-6-Astra** | all-rounder flagship, computer use, code execution, 1M context | Highest |
| **Claude Opus 5** | code review, architecture, security audit, high-stakes decisions | Highest |
| **Claude Sonnet 5** | daily coding, frontend, rapid prototyping | Medium |
| **Gemini-3.8-Flash** | research, video/long-document analysis, 1M context | Medium |
| **GLM-5.2** | long-horizon planning, math, autonomous loops | Low |
| **DeepSeek-V4-Pro** | implementation, algorithms, long-log analysis | Lowest |
| **Kimi K2.6** | multi-agent orchestration, long-running execution | Low |
| **MiniMax-M2.7** | self-healing, production recovery (fallback candidate) | Low |

## Task Types & Routing

| taskType | Primary model | Fallback chain |
|---|---|---|
| `code-review` | Claude Opus 5 | Claude Opus 4.8 → GPT-6-Astra → Claude Sonnet 4.6 |
| `security-review` | Claude Opus 5 | Claude Opus 4.8 → GPT-6-Astra → GLM-5.2 |
| `architecture` | Claude Opus 5 | GPT-6-Astra → GLM-5.2 → Claude Opus 4.7 |
| `implementation` | DeepSeek-V4-Pro | GPT-6-Astra → Claude Sonnet 5 → DeepSeek-V4-Flash |
| `browser-automation` | GPT-6-Astra | GPT-5.5 → Claude Sonnet 5 |
| `research` | Gemini-3.8-Flash | DeepSeek-V4-Pro → Claude Sonnet 5 → GPT-5.6-Sol |
| `planning` | GLM-5.2 | GPT-6-Astra → Claude Opus 5 → Claude Opus 4.7 |
| `testing` | Claude Haiku 4.5 | Claude Sonnet 5 → GLM-5.3-Flash → DeepSeek-V4-Flash |
| `docs` | Claude Sonnet 5 | GLM-5.3-Flash → GPT-5.5 → Kimi K2.6 |
| `frontend` | Claude Sonnet 5 | GPT-5.6-Sol → Kimi K2.6 → GPT-5.5 |
| `self-healing` | GLM-5.2 | GPT-6-Astra → MiniMax-M2.7 → DeepSeek-V4-Pro |
| `general` | GPT-6-Astra | Claude Sonnet 5 → GLM-5.2 → DeepSeek-V4-Pro |

_These tables are derived from `scripts/lib/specs/model-registry.json`; `node scripts/aios.mjs model-router` prints the live registry plus routing rules, and `model-router availability` prints which relay channels look healthy right now._


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


## Client Model Routing Contract

A route only pays off if the client that actually launches can speak the model. AIOS reads that
from the client registry (`scripts/lib/clients/core/definitions.mjs`) rather than guessing, so the
table below is generated data, not opinion:

| Client | `modelRouting` | Protocols it can speak | `--model` flag |
|---|---|---|---|
| codex | `relay` | `openai-response` | `-m` |
| claude | `relay` | `claude` | `--model` |
| gemini | `own` | _none published_ | `-m` |
| opencode | `relay` | `openai-chat`, `openai-response`, `claude`, `gemini` | `-m` |
| hermes | `relay` | `claude`, `openai-chat` | `--model` |
| grok | `own` | _none published_ | `-m` |
| workbuddy | `own` | _none published_ | `--model` |
| pi | `relay` | `openai-chat`, `claude` | `--model` |
| zcode | `own` | _none published_ | `—` |

`relay` clients are native-protocol gateways: point them at `coding.rexai.top` and they serve the
whole curated catalog. `own` clients are launched with **no** model argument so they keep their own
default, and AIOS never rewrites their config. `hermes` can terminate `openai-chat` upstreams but
launches with the Anthropic-compatible channel only, so it declares `claude` + `openai-chat`.

Protocol to endpoint mapping lives in `scripts/lib/model-router/protocols.mjs`:
`openai-chat` -> `/openai/v1/chat/completions`, `openai-response` -> `/openai/v1/responses`,
`claude` -> `/claude/v1/messages`, `gemini` -> `/gemini/v1beta/models/<model>:generateContent`.

Two rules follow:

- **Explicit wins.** If you set `-m`, `AIOS_MODEL_*`, or a task model, the client follows the model
  (provider client plus its own `--model` channel). Only automatic routing may retarget the model
  so it fits the worker client.
- **Automatic routing keeps the worker client.** Team roles, subagents and phase jobs start on the
  client the task asked for; when that client cannot serve the best model for the job, AIOS walks
  the fallback chain to the strongest model the client can actually speak.

Every decision stays inspectable on the route: `requestedModelId` (what was asked for),
`skippedForCapability` (why a candidate lost), `modelProtocols`, `contractMode`.

## Channel Availability (Runtime Layer)

The registry records what a model is good at; a separate state machine records what the relay
serves **right now**. It learns only from real dispatch outcomes:

| Observation | Recorded as |
|---|---|
| `model_not_found`, `no available channel`, truncated gateway response, probe HTTP 404 | channel `down` (404 is immediate) |
| connect/timeout/reset, 5xx, stream cut before the first byte | `network` failure on that channel |
| the relay served a different model id | `degraded` (unstable channel) |
| first byte beyond the latency budget | `degraded` |
| 2 consecutive failures | `down` |
| success | recovery path back to `ok` |

Agent-caused failures (`tool`, `provider-output`, `timeout-after-output`) are **not** channel
evidence — a worker that misused a tool must not cool a model down.

Inspect it with `node scripts/aios.mjs model-router availability`. Routing reads this cache only
when `AIOS_MODEL_AVAILABILITY=1` is set (keeps dispatch deterministic and offline by default); the
effect shows up in `orchestrate plan preview` and in phase dispatch events as `channelDown` /
`degradedChannel`. `down` cools for `cooldownMs` (default 300s)
then auto-recovers; `ok` records expire after `ttlMs` (default 600s). The cache is
`memory/specs/model-availability.json` (`AIOS_MODEL_AVAILABILITY_PATH` overrides;
`AIOS_MODEL_AVAILABILITY_FEEDBACK=0` disables write-back).

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

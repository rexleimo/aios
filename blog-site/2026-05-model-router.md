---
title: "Model Router: Stop Guessing Which AI Model To Use"
description: "A dispatch layer that reads your task description and automatically picks the best AI model for it. No more memorizing model strengths."
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "AIOS"]
---

# Model Router: Stop Guessing Which AI Model To Use

You know the feeling: you have a task, and you're not sure which AI model to use. Claude Opus? DeepSeek? GPT-5.5? Each one is good at different things, and picking the wrong one wastes time and money.

**What if the routing happened automatically?**

Model Router reads your task description, detects what kind of work it is, and sends it to the model that's best at that particular thing.

## The Problem It Solves

Without Model Router, routing looks like this:

| You say | Which model? | Why? |
|---|---|---|
| "Build a landing page" | ??? | Is this frontend? UI? Design? |
| "Review this code for security" | ??? | Claude Opus? GPT-5.5? |
| "Fix the production outage" | ??? | This is ops, not coding |
| "Implement a login endpoint" | ??? | Probably DeepSeek, but maybe not? |

You'd need to memorize every model's strengths and manually switch CLIs. With Model Router, you just describe the task:

```bash
node scripts/aios.mjs model-router route \
  --task "build a beautiful landing page component" \
  --explain
```

Result: `frontend → kimi-k2.6` (because "landing page", "component", "beautiful" signal frontend work).

## How It Knows What To Pick

Model Router looks for **signals** in your task description — keywords that indicate what kind of work you're doing:

| You mention | Detected as | Routes to | Why |
|---|---|---|---|
| "browser", "upload", "screenshot" | browser automation | GPT-5.5 | Best at tool-use reasoning |
| "security", "vulnerability", "auth" | security review | Claude Opus | Strongest reviewer |
| "frontend", "UI", "component" | frontend work | Kimi K2.6 | Best at UI tasks |
| "production", "incident", "logs" | self-healing | MiniMax-M2.7 | Built for ops recovery |
| "long document", "research" | research | Gemini-3-Pro | 1M context window |
| "implement", regular coding | implementation | DeepSeek-V4 | Cheap and fast |

Add `--explain` to any route command to see exactly which signals matched and why.

## The Before/After

Here's what changed with the Balanced v2 router:

| Task | Before (old router) | After (Balanced v2) |
|---|---|---|
| "Open Xiaohongshu and upload images" | implementation → DeepSeek | browser-automation → GPT-5.5 |
| "Build a beautiful landing page" | implementation → DeepSeek | frontend → Kimi K2.6 |
| "Fix the production login outage" | research → Gemini | self-healing → MiniMax-M2.7 |
| "Implement a new login endpoint" | implementation → DeepSeek | implementation → DeepSeek (correct!) |

The key insight: **ordinary implementation stays cheap** (DeepSeek), but tasks that clearly need a specialized model get upgraded automatically.

## Routing Profiles

Three modes to control how aggressive the routing is:

| Profile | When to use | What happens |
|---|---|---|
| `balanced` (default) | Most work | Strong signals upgrade; normal coding stays cheap |
| `premium` | Risky or unclear tasks | More willing to use expensive models |
| `budget` | Cost-sensitive work | Prefers cheap models unless the task really needs a strong one |

```bash
# Per command
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# Or for the whole session
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## Try It

```bash
# View all available models
node scripts/aios.mjs model-router list

# Route a task and see why
node scripts/aios.mjs model-router route \
  --task "your task description here" \
  --profile balanced \
  --explain

# View what's been routed recently
node scripts/aios.mjs model-router stats
```

## Works With Agent Team

Model Router is built into Agent Team — each phase of a team run automatically gets routed to the best model. You don't need to configure anything.

---

*Model Router is part of [Harness CLI](https://cli.rexai.top). See the [full docs](https://cli.rexai.top/model-router/) for all models, rules, and configuration options.*

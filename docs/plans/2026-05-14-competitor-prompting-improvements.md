# Competitor Prompting Improvements (2026-05-14 Refresh)

Date: 2026-05-14

## Scope

Focus: what competitors do differently in prompting that could improve AIOS capability. This is an addendum to the May 10 and May 4 refreshes.

## Updated Metadata (2026-05-14)

| Project | Stars (May 14) | Delta | Last commit | Key signal |
|---------|----------------|-------|-------------|------------|
| `oh-my-openagent` | 57,719 | +1,672 | `b9beea10` (May 14) | Most active; v4.0 Team Mode |
| `OpenHarness` | 12,504 | +508 | `1929ad80` (May 10) | Stable; React TUI |
| `gnhf` | 1,705 | +257 | `bcafaa3e` (May 13) | Growing; npm packaged |
| `overstory` | 1,295 | NEW | `0629c5ba` (May 9) | 11 runtime adapters |
| `OpenViking` | 23,706 | stable | (May 9 data) | L0/L1/L2 tiered loading |

## Key Prompting Improvements Found

### 1. oh-my-openagent: IntentGate + Discipline Agents

**What they do**: Before running, the lead agent performs intent analysis to classify the task and routes to discipline-specific agents (Sisyphus/Hephaestus/Prometheus).

**Prompt pattern**: Intent analysis gate that classifies:
- `planner` → strongest reasoning model
- `builder` → deep implementation model
- `reviewer` → balanced speed/quality model

**AIOS opportunity**: The AIOS model-router already has role-based routing. Missing: intent analysis before routing. Could add a pre-flight intent classification step that sets `AIOS_MODEL_PLANNER`, `AIOS_MODEL_IMPLEMENTER`, etc. based on task signal.

### 2. gnhf: Iteration Prompt + Notes Artifacts

**What they do**: Each agent loop iteration gets `prompt + notes` where notes carry context about previous iterations, blockers, and next steps.

**Prompt pattern**:
```
# Iteration N
## Objective
[from operator]

## Previous context
[from .gnhf/runs/N-1/notes.md]

## Notes for this run
[blockers, decisions, artifacts created]
```

**AIOS opportunity**: AIOS ContextDB already has memory. Could create an iteration context artifact that gets injected as structured notes before each harness resume, combining checkpoint state + memory recall results + previous run summary.

### 3. OpenHarness: Dry-run Readiness Verdicts

**What they do**: Before running, produce a machine-readable `ready/warning/blocked` verdict with concrete next actions.

**Prompt pattern**: Readiness check that evaluates:
- Tool permissions available
- Required hooks defined
- Context/memory loaded
- Plan/checkpoint exists
- Blockers listed with fix commands

**AIOS opportunity**: AIOS `quality-gate` exists but isn't wired into `team`/`orchestrate` preflight. Could add `aios team --dry-run` that produces structured verdict and surfaces blocking issues with suggested commands.

### 4. OpenViking: Tiered Context Loading in Prompt

**What they do**: System prompt includes tiered context sections with explicit budget labels:

```
# L0 (hot, <2K tokens)
[plan, current task, recent checkpoints]

# L1 (warm, <5K tokens)
[related history, project knowledge]

# L2 (cold, archived)
[rarely accessed, skip unless queried]
```

**AIOS opportunity**: AIOS already has `TIER_BUDGET_MAP` and `CONTEXT_TIERS` in the model-router skill. Missing: actual prompt injection that segments context by tier with budget labels. The memory filter is there but not the prompt assembly.

### 5. overstory: SQLite Mail Bus + Structured Events

**What they do**: Agents communicate via structured SQLite mail messages instead of shared context.

**Prompt pattern**: Each agent receives messages as a structured inbox:
```
## Inbox
- From: orchestrator, Subject: SUBTASK_ASSIGNED, Body: "implement X using Y constraint"
- From: reviewer, Subject: CODE_REVIEW, Body: "N issues found in file Z"
```

**AIOS opportunity**: For multi-agent AIOS runs, structured inbox messages could replace shared context for parallel agents, reducing cross-contamination and improving independence.

## Recommended AIOS Prompting Improvements

| # | Improvement | Source | Priority | Complexity |
|---|-------------|--------|----------|-----------|
| 1 | Pre-flight intent classifier → set model env vars | oh-my-openagent IntentGate | P0 | Medium |
| 2 | Iteration context artifact injection | gnhf notes loop | P0 | Low |
| 3 | `team --dry-run` readiness verdict | OpenHarness dry-run | P0 | Medium |
| 4 | Tiered context assembly in system prompt | OpenViking L0/L1/L2 | P1 | Medium |
| 5 | Structured agent inbox for parallel runs | overstory mail bus | P2 | High |

## Data Sources

- Watchlist: `memory/knowledge/competitor-watchlist.json` (updated May 14)
- Analysis: `memory/knowledge/competitor-analysis.md` (updated May 10)
- Prior plans: `docs/plans/2026-05-10-competitor-refresh-agent-optimization.md`
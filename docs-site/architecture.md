---
title: "How AIOS Works: One Sentence Triggers Memory, Routing, Teams, and Verification"
description: "AIOS makes your AI coding agent finish complex tasks from one sentence. See how memory, automatic routing, parallel teams, and verification work together underneath your existing Claude Code, Codex, Gemini, OpenCode, Hermes, or Grok client."
---

# How AIOS Works

## Quick Answer

You tell your AI coding agent what you need — in one sentence. AIOS makes it actually finish the job. It remembers your project context across sessions, picks the right approach for each task, dispatches parallel work when needed, and verifies every change before showing you results. All locally. All without changing how you work.

![AIOS architecture overview](assets/visual-architecture-overview.svg)

## Components

| Layer | Main surface | Responsibility |
| --- | --- | --- |
| Client entry | scripts/contextdb-shell.zsh, client-sources/, native guidance | expose project instructions and route hints |
| Startup bridge | scripts/contextdb-shell-bridge.mjs, scripts/ctx-agent.mjs | decide wrapper or passthrough behavior and launch the client |
| ContextDB | mcp-server/src/contextdb/, .aios/context-db/ | persist sessions, memo, checkpoints, search data, and context packs |
| Workflow Policy | scripts/lib/planning/workflow-policy.mjs, auto-gate.mjs, cli.mjs | classify noop, direct, guarded, or planned work |
| Operations | scripts/aios.mjs, team, harness, orchestrate, HUD | dispatch work, record status, and surface evidence |
| Browser | scripts/run-browser-use-mcp.sh, chrome.*, browser.*, page.* | run browser-use MCP over CDP |
| Research | scripts/lib/rl-core/, rl-* adapters | isolated RL experiments and evaluation |

## Runtime flow

![Workflow policy routes](assets/visual-workflow-policy.svg)

~~~text
user command
  -> supported client and native project guidance
  -> optional shell bridge / ctx-agent compatibility path
  -> .aios/context-db/index.json registry
  -> ContextDB search, memo, checkpoint, or context pack
  -> Workflow Policy route decision
  -> direct work, Team, Solo Harness, or Orchestrate
  -> diagnostics, tests, and verification evidence
~~~

A route decision is not a completed implementation. File edits still pass pre-edit safety and final verification gates.

## ContextDB and storage boundaries

![ContextDB memory loop](assets/visual-contextdb-memory-loop.svg)

The project registry points to local sources:

~~~text
.aios/
  context-db/
    index.json
    sessions/
    index/
    exports/
  memo/
    file/events.jsonl
    split/
~~~

The current public model is pull-based. The agent searches or recalls relevant sources instead of receiving all history automatically. Older wrapper modes and .contextdb-enable remain compatibility behavior and are not the preferred onboarding path.

## Workflow Policy boundary

Workflow Policy is risk-based:

| Disposition | Use |
| --- | --- |
| noop | no action is required |
| direct | answer or inspect without a persistent plan |
| guarded | small, clear local change with edit and verification gates |
| planned | multi-step, risky, delegated, resumable, or unclear work |

Plans can be none, reused, or newly created. Same-session acknowledgement is distinct from explicit cross-client resume. See [Workflow Policy](workflow-policy.md) for the canonical rules.

## Team, Solo Harness, and Orchestrate

- Agent Team is for independent work packages that can be owned separately. HUD, status, history, and quality categories provide operational evidence.
- Solo Harness is for one explicit long-running objective with checkpoints, stage journals, worktree support, and resume status.
- Orchestrate is for staged dispatch DAGs and quality-gated phase execution.
- dry-run is a local simulation. It confirms parsing and planned state, not that a live model provider or client route will work.
- live subagent execution is opt-in and currently uses the configured subagent runtime boundary. Inspect the current doctor and command help before enabling it.

Relevant controls:

~~~bash
aios team status --watch
aios harness status --session <session-name> --json
aios orchestrate --help
aios doctor --native --verbose
~~~

## Browser runtime

The documented default is browser-use MCP over CDP:

- launcher: scripts/run-browser-use-mcp.sh
- launch: chrome.launch_cdp
- connect: browser.connect_cdp
- page actions: page.semantic_snapshot, page.extract_text, page.goto, page.screenshot
- profile configuration: config/browser-profiles.json

Use a visible CDP browser, read semantic or targeted text first, and keep read -> act -> verify loops short. The legacy Playwright MCP in mcp-server is retained for compatibility and low-level inspection; it is not the default business-flow path.

## RL research surface

AIOS also contains isolated multi-environment RL research surfaces. They are not required for normal AIOS installation or documentation workflows.

### RL Training Layer (AIOS) {#rl-training-layer-aios}

The shared control plane under scripts/lib/rl-core/ tracks campaign state, checkpoint lineage, comparison results, replay lanes, teacher signals, and trainer entry points. Adapters cover shell, browser, orchestrator, and mixed experiments.

~~~bash
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
~~~

Treat RL status and benchmarks as research evidence with their own environment and version scope. They do not automatically prove production client reliability or public performance claims.

## Graph Engineering view

AIOS implements the same architecture as a **local-first Graph Engine for coding agents**: nodes, edges, shared state, failure routing, fan-out, isolation, and model tiering — all composed into a verifiable graph underneath the CLI you already use. The keyword "Graph Engine" and its building blocks (Graph Engineering, agent graph, verifiable graph) describe the same capability below.

For external reference points on the Graph Engine keyword: [LangGraph](https://langchain-ai.github.io/langgraph/) pioneered the "graph of LLMs" pattern in the Python / LangChain ecosystem; [Rust-LangGraph](https://www.rust-langgraph.dev/) ported it to Rust; [AWS Step Functions + Amazon Bedrock](https://aws.amazon.com/step-functions/) and [Google Vertex AI Workflows](https://cloud.google.com/vertex-ai) offer cloud-managed graph orchestration; and [CrewAI](https://docs.crewai.com/), [AutoGen](https://microsoft.github.io/autogen/stable/) and [PydanticAI](https://ai.pydantic.dev/) complete the ecosystem. AIOS differs by being **local-first**: the graph runs on your machine, shared state lives in the local ContextDB, and no prompt or code data leaves your environment.

| Graph Engine component | AIOS implementation |
| --- | --- |
| Nodes (one loop per node, with a contract) | `rex-harness` capability nodes: Fact → Capability → Evidence with bounded contracts |
| Edges (routing by checks) | Workflow Policy `direct` / `guarded` / `planned`; `aios plan auto-gate` runtime routing |
| Shared State | ContextDB project memory (memo, checkpoints, searchable packs), pull-based |
| Failure Routing | Evidence gates and terminal `blocked` outcomes: replan, escalate, or stop |
| Fan-out / fan-in | `aios team` parallel agents with a barrier and evidence reduction |
| Isolation | `aios harness run --worktree` git worktree isolation |
| Model tiering | `model-router` per-node model selection |
| Dynamic workflows | `aios plan auto-gate --dry-run` describes the objective, the route is selected at runtime |

Start with a stable loop (`aios harness`, verification gates, ContextDB state), then wire loops into a graph (`aios team`, workflow routing) when the work actually splits into roles and parallel sub-tasks.

## Failure boundaries

- Missing registry: run aios init --all from the intended project root.
- Stale native guidance: run aios doctor --native --verbose, then inspect a dry run before --fix.
- Missing browser auth: keep the human in the loop at the authentication wall.
- Failed live route: compare dry-run evidence with the actual provider and client status.
- Failed verification: keep the plan open and record the first failing command.

## Next steps

- [Quick Start](getting-started.md) - install and initialize.
- [Workflow Policy](workflow-policy.md) - choose the route.
- [Agent Team](team-ops.md) - coordinate independent work.
- [Solo Harness](solo-harness.md) - run a resumable objective.
- [Troubleshooting](troubleshooting.md) - recover an observable failure.

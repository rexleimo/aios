# AIOS Competitor Feature Roadmap

Date: 2026-04-25
Updated: 2026-05-10

## Scope

This note synthesizes local competitor snapshots under `temp/competitor-repos/` plus current AIOS docs/code references. The original roadmap was written from the 2026-04-24/25 local snapshots. On 2026-05-04, AIOS refreshed GitHub metadata for the harness/agent-heavy watchlist rows. On 2026-05-10, AIOS performed a full shallow-clone refresh with source analysis and implemented 4 P0 agent capability optimizations.

## 2026-05-10 Full Refresh & Implementation

See `docs/plans/2026-05-10-competitor-refresh-agent-optimization.md` for the full refresh report and implementation details.

Key changes implemented:
1. **Multi-model discipline agent routing** — 8 role→model mappings in `model-registry.json`
2. **Todo Enforcer idle detection** — 120s idle → nudge, 3x → blocked in `watchdog.mjs`
3. **ContextDB L0/L1/L2 tiered loading** — token budget tiers in `facade.mjs`
4. **Skill-scoped MCP definitions** — `mcp_servers` field in skill JSON format

New competitor added: `jayminwest/overstory` (P0, multi-agent orchestration via SQLite mail).

## 2026-05-04 Metadata Refresh Addendum

The latest known upstream activity in the harness/agent focus set still clusters around execution contracts, recovery, and operator-facing control:

- `HKUDS/OpenHarness` -> `7873f0d10917` (`2026-05-03T09:03:42Z`)
- `lazynet/lazy-harness` -> `04bb2119d16e` (`2026-05-03T15:42:34Z`)
- `kunchenguid/gnhf` -> `011f3d38ed8e` (`2026-05-03T05:38:10Z`)
- `code-yeongyu/oh-my-openagent` -> `9ba3b574a7d1` (`2026-05-03T09:43:40Z`)

The practical conclusion from the May 4 refresh is confidence, not redirection: AIOS should still prioritize harness reliability, readiness verdicts, plan/ownership discipline, edit safety, and browser evidence before broadening the generated-agent surface.

## Executive Summary

AIOS already has strong primitives: ContextDB, cross-CLI wrappers, `team` / `orchestrate`, Browser MCP, HUD, Privacy Guard, pre-mutation snapshots, and rollback. Competitors are strongest in five areas AIOS can productize next:

1. Context memory quality and explainability.
2. Long-running worker recovery and compaction continuity.
3. Plan discipline, ownership visibility, and edit safety.
4. Browser visual evidence and regression reports.
5. Operator control plane and generated team templates.

The May 4 metadata refresh strengthens one ordering rule inside that roadmap: `watchdog + readiness verdict + plan/ownership blockers` should land before broader team-factory or surface-area expansion.

## Highest-Value Feature Gaps

| Priority | Feature | Competitor reference | AIOS opportunity |
|---|---|---|---|
| P0 | ContextDB explain + hygiene | OpenViking, OpenClaw Recall | Add `contextdb search --explain`, suppression reasons, `status/prune-noise/reindex/compact`. |
| P0 | Worker watchdog + auto recovery | long-running-tasks, OpenHarness, lazy-harness | Upgrade `team status --watch` from observation to commit/file/CPU/log stall detection plus pause/retry/resume. |
| P0 | Run readiness verdicts | OpenHarness, lazy-harness | Add machine-readable `ready/warning/blocked` verdicts with top next actions for `aios team`, `aios orchestrate`, and browser flows. |
| P0 | Compact continuity chain | lazy-harness | Save working summary before compaction/session end and reinject on resume/session start. |
| P0 | Plan/ownership gates | execplan-skills, oh-my-openagent | Block multi-step work when plan/checkpoint/owned path evidence is missing or invalid. |
| P0 | Browser smoke evidence | vision-test-harness | YAML/JSON browser flows, screenshots, pixel diff, privacy overlay, HTML report. |
| P1 | Hybrid retrieval/rerank | OpenClaw Recall, OpenViking | Add lexical/semantic/hybrid retrieval, candidate expansion, MMR/RRF, L0/L1/L2 drill-down. |
| P1 | Hash-anchored edit validation | oh-my-openagent | Add stable line/hash validation for generated plans, skills, agents, and critical scripts. |
| P1 | Orchestrator selftest | lazy-harness, OpenHarness | `aios doctor --orchestrate` / `aios selftest` for config, wrappers, subagent clients, ContextDB, telemetry. |
| P1 | Evidence HUD | golutra, vision-test-harness | Show latest run, failing screenshot, diff percentage, blocker, and next command in HUD/team history. |
| P2 | Team factory templates | revfactory/harness | Generate domain-specific agent/team/skill specs from reusable architecture patterns. |
| P2 | Service dashboard | RavenPair, golutra | REST/WebSocket or lightweight local dashboard if AIOS grows beyond local-first CLI. |
| P2 | Session commit/extract lifecycle | OpenViking | Explicit `session:commit` to summarize, extract long-term memory, and update context indexes. |

## Domain Findings

### 1. Context / Memory / Retrieval

Best competitors:

- OpenViking: filesystem-style context database with `viking://`-like hierarchy, memory/resources/skills unification, L0/L1/L2 layered context, directory-first recursive retrieval, retrieval trajectory, and session commit/extraction lifecycle.
- OpenClaw Recall: practical memory plugin with `preference/semantic/episodic/session_state` memory types, hybrid retrieval, RRF/MMR diversification, retrieval gates, noise/sensitive filtering, and operator commands such as `doctor`, `status`, `memory explain`, `prune-noise`, `reindex`, and `compact`.

Evidence:

- `temp/competitor-repos/volcengine__OpenViking/README.md:46`
- `temp/competitor-repos/volcengine__OpenViking/docs/en/concepts/03-context-layers.md:3`
- `temp/competitor-repos/volcengine__OpenViking/docs/en/api/06-retrieval.md:3`
- `temp/competitor-repos/volcengine__OpenViking/docs/en/concepts/08-session.md:7`
- `temp/competitor-repos/Felix201209__openclaw-recall/README.md:22`
- `temp/competitor-repos/Felix201209__openclaw-recall/README.md:47`
- `temp/competitor-repos/Felix201209__openclaw-recall/src/memory/MemoryRetriever.ts:35`
- `temp/competitor-repos/Felix201209__openclaw-recall/src/memory/MemoryRanker.ts:7`

Recommended AIOS work:

- P0: `contextdb search --explain` with candidate score breakdown, retrieval mode, suppression reason, and skipped-memory reason.
- P0: ContextDB hygiene commands: `status`, `prune-noise --dry-run`, `reindex`, `compact`, with noise counts and source stats.
- P1: Hybrid retrieval and rerank with lexical/semantic/hybrid modes, MMR diversification, RRF-style fusion, and intent-aware memory-type balancing.
- P1: Stronger L0/L1/L2 context pack outputs that support summary-first, drill-down-later usage.
- P2: Explicit `session:commit` that summarizes, extracts long-term memory, records used contexts/skills, and updates indexes.

### 2. Orchestration / Harness / Long-Running Reliability

Best competitors:

- OpenHarness: dry-run readiness with `ready/warning/blocked`, concrete next actions, permissions/hooks/task lifecycle, MCP, background tasks, and retry/backoff.
- lazy-harness: profile isolation, hooks, SQLite monitoring, knowledge directory, scheduler, migration dry-run/backup/rollback, pre-compact summary, post-compact reinjection, and selftest.
- long-running-tasks: cron-based unattended queue, one-task cold-start workers, intermediate commits, `.pause`, progress reports, and multi-signal stall detection.
- gnhf: overnight iteration loop with resume notes, commit/rollback ergonomics, and worktree-preserving isolation for long unattended runs.

Evidence:

- `temp/competitor-repos/HKUDS__OpenHarness/README.md:270`
- `temp/competitor-repos/HKUDS__OpenHarness/README.md:295`
- `temp/competitor-repos/HKUDS__OpenHarness/src/openharness/api/client.py:32`
- `temp/competitor-repos/lazynet__lazy-harness/README.md:13`
- `temp/competitor-repos/lazynet__lazy-harness/README.md:20`
- `temp/competitor-repos/lazynet__lazy-harness/src/lazy_harness/hooks/builtins/pre_compact.py:2`
- `temp/competitor-repos/mmTheBest__long-running-tasks/README.md:27`
- `temp/competitor-repos/mmTheBest__long-running-tasks/README.md:48`
- `temp/competitor-repos/mmTheBest__long-running-tasks/references/orchestrator-cron.md:102`

Recommended AIOS work:

- P0: Upgrade `team status --watch` into a watchdog with commit age, file activity, worker process/CPU, and log freshness; connect to `team --resume`, `retry-blocked`, and rollback.
- P0: Add readiness verdicts for `aios team`, `aios orchestrate`, and browser flows with `ready/warning/blocked` plus actionable next steps.
- P0: Add `.pause` semantics and a recovery decision object: `observe`, `retry`, `respawn`, `rollback`, `human_gate`.
- P0: Add compact continuity: pre-compact/session-end summary plus post-compact/session-start reinjection through ContextDB.
- P1: Add `aios selftest` or `aios doctor --orchestrate` for machine health: wrapper state, ContextDB writeability, subagent clients, browser MCP, telemetry paths, scheduler availability.
- P1: Add recurring jobs for `learn-eval`, stale session cleanup, watchdog checks, and scheduled doctor.
- P1: Expand dry-run output into a reusable readiness layer shared by text summaries, JSON output, HUD, and browser preflight.

### 3. Execution Quality / Planning / Edit Safety

Best competitors:

- oh-my-openagent: discipline agents, model/task routing, Prometheus planner, hash-anchored edits, LSP/AST-grep, todo continuation enforcer, comment checker, write guards, and directory-level AGENTS injection.
- execplan-skills: planner/generator/evaluator separation, living ExecPlan, progress/decision/surprise/outcome logs, and clean-room evaluation.
- revfactory/harness: domain brief to generated team architecture, agents, skills, six architecture patterns, and evolution feedback loop.

Evidence:

- `temp/competitor-repos/code-yeongyu__oh-my-openagent/README.md:146`
- `temp/competitor-repos/code-yeongyu__oh-my-openagent/README.md:149`
- `temp/competitor-repos/code-yeongyu__oh-my-openagent/docs/guide/orchestration.md:86`
- `temp/competitor-repos/code-yeongyu__oh-my-openagent/docs/guide/agent-model-matching.md:168`
- `temp/competitor-repos/jesse-black__execplan-skills/skills/planner-execplan/SKILL.md:22`
- `temp/competitor-repos/jesse-black__execplan-skills/skills/generator-execplan/SKILL.md:24`
- `temp/competitor-repos/jesse-black__execplan-skills/skills/evaluator-execplan/SKILL.md:23`
- `temp/competitor-repos/revfactory__harness/README.md:24`
- `temp/competitor-repos/revfactory__harness/README.md:56`

Recommended AIOS work:

- P0: Enforce plan/checkpoint fields for substantial work: `Progress`, `DecisionLog`, `Acceptance`, `NextActions`, evidence paths, and blocker state.
- P0: Surface editable ownership as a first-class blocker in `orchestrate`, `team status`, and HUD.
- P1: Add hashline/stable-line-id validation for critical files and generated plans/skills/agents.
- P1: Turn `memory/specs/orchestrator-agents.json` into a stronger canonical source for generated client agent files and validation.
- P1: Make `team history` default to executable summaries: current blocker, suggested command, role/runtime uncertainty, and latest evidence.
- P2: Add domain-specific team factory templates for feature, bugfix, refactor, security, docs, browser-flow, and research tasks.
- P2: Feed `learn-eval` and dispatch hindsight back into blueprint/skill patch candidates.

### 4. Browser / Visual Evidence / Operator UX

Best competitors:

- vision-test-harness: YAML test flows, Playwright screenshot capture, pixel diff, privacy overlay, AI diagnosis, HTML reports, and CI/MCP integration.
- golutra: visual multi-agent control plane with workspace selection, agent/log inspection, terminal prompt injection, workflow templates, status tracking, and polished desktop UI.
- RavenPair: service-style control plane with REST/WebSocket progress, task/run data model, plugin-only capabilities, event bus, and pgvector-backed memory.

Evidence:

- `temp/competitor-repos/UpGPT-ai__vision-test-harness/README.md:7`
- `temp/competitor-repos/UpGPT-ai__vision-test-harness/README.md:33`
- `temp/competitor-repos/UpGPT-ai__vision-test-harness/README.md:113`
- `temp/competitor-repos/UpGPT-ai__vision-test-harness/src/report/html-report.ts:63`
- `temp/competitor-repos/golutra__golutra/README.md:69`
- `temp/competitor-repos/golutra__golutra/README.md:71`
- `temp/competitor-repos/golutra__golutra/README.md:77`
- `temp/competitor-repos/ravenpair__ravenpair/README.md:5`
- `temp/competitor-repos/ravenpair__ravenpair/README.md:92`

Recommended AIOS work:

- P0: Add `browser_smoke` / `browser_test_run` on top of current Browser MCP: YAML/JSON steps, assertions, screenshots, baseline compare, and HTML evidence report in `temp/`.
- P0: Add privacy overlay/redaction to browser reports before screenshots are shared or persisted into reports.
- P1: Add `browser_diagnose` that combines screenshot, console/network snippets, DOM/selector evidence, and source context into fix hints.
- P1: Upgrade HUD into an evidence panel: run card, screenshot thumbnail, diff percentage, failed assertion, suggested next command.
- P2: Consider a lightweight local web dashboard before any full Tauri/desktop app or hosted service.
- P2: Borrow RavenPair-style REST/WebSocket only if AIOS becomes multi-user or long-lived daemon first.

## Suggested Delivery Sequence

### Milestone 1: Reliability Core (P0)

1. ContextDB explain + hygiene.
2. Worker watchdog with recovery decision states.
3. Run readiness verdicts for `team` / `orchestrate` / browser flows.
4. Compact continuity chain.
5. Plan/ownership preflight blockers.
6. Browser smoke evidence reports with privacy overlay.

Success signal: a long-running browser/team task can explain its context, prove visual outcomes, recover from stalled workers, and show next actions without reading raw logs.

### Milestone 2: Quality Upgrade (P1)

1. Hybrid retrieval/rerank and layered context pack drill-down.
2. Orchestrator selftest.
3. Hash-anchored edits for critical artifacts.
4. Evidence-rich HUD/team history.
5. Recurring scheduler jobs.

Success signal: operator can trust AIOS to choose relevant memory, avoid stale edits, and surface actionable status across sessions.

### Milestone 3: Productization (P2)

1. Domain team factory templates.
2. Learn-eval feedback into blueprint and skill patch candidates.
3. Explicit session commit/extract lifecycle.
4. Lightweight dashboard, then optional service API if needed.

Success signal: AIOS becomes a self-improving local-first agent operating system rather than a collection of wrappers and scripts.

## Anti-Goals For Now

- Do not build a full desktop app before browser evidence and reliability gates are strong.
- Do not add a remote server/control plane before local-first privacy and recovery semantics are stable.
- Do not optimize retrieval ranking before adding explainability; otherwise tuning will remain opaque.
- Do not generate more agents/skills before enforcing plan, ownership, and verification contracts.

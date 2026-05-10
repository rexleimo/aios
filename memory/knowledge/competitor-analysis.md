# AIOS Competitor Watchlist Analysis

Updated: 2026-05-10T18:30:00+08:00

## 2026-05-10 Full Refresh Findings

Full metadata refresh + shallow clone analysis for all tracked projects. Key movements since the May 6 refresh:

| Signal | Detail | AIOS implication |
|---|---|---|
| oh-my-openagent Team Mode v4.0 | Released Team Mode: lead + 8 parallel members, tmux visualization, discipline agents (Sisyphus/Hephaestus/Prometheus), IntentGate, Hash-Anchored Edits, skill-embedded MCPs, Ralph Loop. Multi-model: Opus + Kimi K2.6 + GPT-5.5 + GLM-5.1. | Highest-signal competitor for agent execution quality. AIOS must adopt: multi-model discipline agents, intent analysis gate, skill-scoped MCP loading, and completion enforcement (Todo Enforcer). |
| overstory v0.11.0 (NEW) | Multi-agent orchestration via SQLite mail system, 11 runtime adapters, Web UI fleet management, coordinator/orchestrator architecture, git worktree isolation, tiered conflict resolution. | Direct competitor for AIOS team runtime. Key adopt: structured mail-based agent communication, web UI for fleet visibility, multi-runtime adapter pattern. |
| OpenHarness auto-dream | Added auto-dream memory consolidation, 43+ tools, plugin ecosystem, context compression, session resume, React TUI. | AIOS ContextDB should add background memory consolidation during idle periods. |
| golutra CEO Agent roadmap | Announced CEO Agent: month-long autonomous coordinator, infinite agent network, agent self-evolution, cross-device migration, mobile remote control. | golutra is evolving from multi-agent tool → digital life system. AIOS should monitor and prepare for long-horizon autonomous coordination. |
| OpenViking L0/L1/L2 tiered loading | Active development with tiered context loading, directory recursive retrieval, visualized retrieval trajectory, multi-provider VLM (Kimi/GLM/OpenAI). | AIOS ContextDB must adopt tiered loading to reduce token consumption. Visualization of retrieval trajectory is a key differentiator. |
| superpowers 180K+ stars | `obra/superpowers`: now on Claude Code plugin marketplace, Codex plugin marketplace, Gemini CLI, Cursor, Factory Droid, GitHub Copilot CLI. | Skills methodology is now the de facto standard across all major coding agents. AIOS native integration is validated. |
| gnhf v0.1.41 | Agent skill bundled in npm package, worktree isolation for parallel agents, exit summary with branch diff stats. | AIOS should bundle agent-facing skill files for autonomous harness use. |
| Hermes-agent | Session-centric UX with FTS5 recall, subagent delegation, cron, multi-platform gateway (Telegram/Discord/Slack/WhatsApp/Signal), Ink TUI. | Validated session-aware recall UX. AIOS ContextDB + team direction is correct. |
| OpenClaw 370K+ stars | 370,251 stars, 76,475 forks, pushed 2026-05-10. | The base platform continues to grow. AIOS plugin compatibility is important. |
| OpenViking 23.7K stars | 23,706 stars (+188 in 4 days), 1,762 forks, pushed 2026-05-09. | Context databases as agent infrastructure is a validated and growing category. |

## 2026-05-06 Full Refresh Findings

Full GitHub metadata refresh for all 16 tracked projects. Key movements since the May 4 refresh:

| Signal | Detail | AIOS implication |
|---|---|---|
| golutra revived | `golutra/golutra` pushed 2026-05-01 after 3-week dormancy since Apr 7. Stars: 3,380 (up from 3,289). | Closest UX/control-plane competitor is active again. Likely new release. Monitor for desktop orchestration features that could set user expectations. |
| superpowers explosive growth | `obra/superpowers`: 179,914 stars (up ~13K in ~12 days), pushed May 6. | Skills methodology becoming industry standard. AIOS should keep current and differentiate through ContextDB integration, not skill count. |
| Harness quartet all pushed today | `OpenHarness`, `gnhf`, `oh-my-openagent`, `lazy-harness` all have commits on May 5-6. | The entire harness space is converging on reliability + ownership + recovery. AIOS is aligned with this direction. |
| Hermes-agent scaling | `NousResearch/hermes-agent`: 134,949 stars (up ~3K in 2 days), 20,615 forks. Pushed today. | Session-centric agent UX with FTS5 recall and subagent delegation is gaining adoption. Validates AIOS ContextDB + team direction. |
| OpenViking steady growth | `volcengine/OpenViking`: 23,518 stars (up ~500 in 12 days), 1,736 forks. Pushed today. | Context databases as agent infrastructure is a validated category. AIOS ContextDB can differentiate through CLI-native explain/hygiene tooling. |

### Competitive pressure assessment

- **golutra revival is the biggest new signal.** As the most similar product (similarity 5/5), their return to active development means the desktop control-plane UX category is alive. AIOS should accelerate the HUD/evidence panel work before golutra defines user expectations in this space.
- **The harness convergence is now unanimous.** All 7 harness/agent projects in the watchlist are actively pushing commits. The shared theme across all of them: reliability contracts, ownership tracking, plan discipline, and recovery semantics. Zero competitors are adding more raw agent types.
- **superpowers growth changes the skill ecosystem.** At ~180K stars and new pushes, the superpowers methodology is becoming a de facto standard. AIOS's investment in native superpowers integration is validated, but we need stronger differentiation through ContextDB-backed skill execution evidence.

## Operating Memory

- When the user says `更新竞品内容`, manually refresh relevant rows in `memory/knowledge/competitor-watchlist.json` as needed.
- When the user asks `竞品列表有哪些`, answer with a Markdown table using the fields in `memory/knowledge/competitor-watchlist.json`.
- Do not commit third-party source snapshots under `temp/competitor-repos/`; they are git-ignored and should remain local evidence.
- If a short repository name becomes ambiguous, keep the current resolved repo but mention the resolution note from the JSON.
- If unauthenticated GitHub API rate limits occur, retry later or update known public branches through codeload tarballs and record the limitation.

## 2026-05-04 Harness/Agent Refresh Note

- On 2026-05-04, AIOS refreshed GitHub metadata for the harness/agent-heavy references in `memory/knowledge/competitor-watchlist.json`: `HKUDS/OpenHarness`, `lazynet/lazy-harness`, `mmTheBest/long-running-tasks`, `kunchenguid/gnhf`, `code-yeongyu/oh-my-openagent`, `revfactory/harness`, and `UpGPT-ai/vision-test-harness`.
- This refresh updated latest-known commit, push time, star count, and fork count in the watchlist. The strongest movement was still concentrated around harness reliability and execution-quality projects: `code-yeongyu/oh-my-openagent`, `HKUDS/OpenHarness`, `lazynet/lazy-harness`, and `kunchenguid/gnhf`.
- Important caveat: during this run, full tarball snapshot refreshes under `temp/competitor-repos/` stalled on large downloads. The commit values below therefore represent the latest known upstream GitHub metadata for refreshed rows, while some local snapshots may still lag behind those commits.
- Product conclusion does not change: AIOS should keep prioritizing harness reliability, plan/ownership discipline, edit safety, and browser evidence before adding more surface area or more generated agents.

## Quick Ranking

| Priority | Project | Essence | AIOS relevance | Similarity | Impact | Local path | Latest known commit |
|---|---|---|---|---:|---:|---|---|
| P0 | [HKUDS/OpenHarness](https://github.com/HKUDS/OpenHarness) | Python open agent harness/Claude Code-style runtime with tool registry, permissions, hooks, MCP, background tasks, auto-compaction, team coordination, and dry-run preview. | Direct reference for making AIOS a complete harness rather than only wrappers: dry-run, permissions, hooks, task lifecycle, and TUI diagnostics. | 5/5 | 5/5 | `temp/competitor-repos/HKUDS__OpenHarness` | `11996 stars` (2026-05-06) |
| P0 | [lazynet/lazy-harness](https://github.com/lazynet/lazy-harness) | Cross-platform harness wrapper for AI coding agents with profiles, hooks, SQLite monitoring, knowledge directory, scheduler, migration, rollback, and strict TDD workflow. | Directly overlaps with AIOS wrappers, ContextDB, doctor/status, scheduler, and migration safety; high practical improvement value. | 5/5 | 5/5 | `temp/competitor-repos/lazynet__lazy-harness` | `2026-05-05` |
| P0 | [mmTheBest/long-running-tasks](https://github.com/mmTheBest/long-running-tasks) | OpenClaw skill for autonomous sequential task queues using TODO.md, cron orchestration, cold-start workers, intermediate commits, and multi-signal stall detection. | Directly improves AIOS long-running harness resilience and stop/retry rules. | 5/5 | 5/5 | `temp/competitor-repos/mmTheBest__long-running-tasks` | `2026-03-06` (stable) |
| P0 | [kunchenguid/gnhf](https://github.com/kunchenguid/gnhf) | Agent-agnostic overnight orchestrator that runs iterative coding-agent loops with per-iteration commits, rollback-on-failure, resume metadata, and optional git worktree isolation. | Direct reference for AIOS long-running harness ergonomics: commit cadence, rollback semantics, resume UX, worktree isolation, and per-agent adapter simplicity. | 4/5 | 5/5 | `temp/competitor-repos/kunchenguid__gnhf` | `1448 stars` (2026-05-06) |
| P0 | [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | Batteries-included OpenCode/OpenAgent harness with model-category routing, discipline agents, parallel background agents, LSP/AST tools, tmux, and hash-anchored edits. | High-value execution ideas for AIOS team runtime: model routing, stronger edit verification, LSP/AST tools, and long-running continuation loops. | 4/5 | 5/5 | `temp/competitor-repos/code-yeongyu__oh-my-openagent` | `56047 stars` (2026-05-06) |
| P0 | [volcengine/OpenViking](https://github.com/volcengine/OpenViking) | Agent-native context database using a filesystem paradigm for memory, resources, and skills with hierarchical retrieval and session self-iteration. | Directly maps to AIOS ContextDB and can improve context hierarchy, retrieval observability, and self-evolving memory. | 4/5 | 5/5 | `temp/competitor-repos/volcengine__OpenViking` | `23518 stars` (2026-05-06) |
| P0 | [nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) | Session-centric agent product: core agent loop, tool registry, SQLite/FTS5 session DB, recall + summarization, subagent delegation, cron scheduler, multi-platform gateway, Ink TUI. | High-value UX reference: session-aware recall, delegation progress, tool capability manifest, cron hooks. | 4/5 | 5/5 | `temp/competitor-repos/nousresearch__hermes-agent` | `134949 stars` (2026-05-06) |
| P1 | [golutra/golutra](https://github.com/golutra/golutra) | Tauri desktop multi-agent workspace/control plane that keeps existing CLIs and adds visual orchestration, parallel execution, workflow templates, and terminal prompt injection. | Very similar product direction at the UX/control-plane layer; AIOS is more local-first CLI/runtime/memory/browser, Golutra is more visual desktop workspace. | 5/5 | 4/5 | `temp/competitor-repos/golutra__golutra` | `3380 stars` (revived 2026-05-01) |
| P1 | [Felix201209/openclaw-recall](https://github.com/Felix201209/openclaw-recall) | OpenClaw memory plugin with persistent memory types, layered compression, hybrid retrieval, RRF/MMR diversification, guardrails, and inspection CLI/dashboard. | Directly useful for ContextDB recall quality, prompt budgets, explainability, and memory hygiene. | 4/5 | 4/5 | `temp/competitor-repos/Felix201209__openclaw-recall` | `2026-03-21` (stable) |
| P1 | [jesse-black/execplan-skills](https://github.com/jesse-black/execplan-skills) | Persona-split ExecPlan workflow: planner creates/updates living plan, generator implements and maintains it, evaluator independently reviews against the plan. | Excellent lightweight upgrade for AIOS docs/plans and long-running handoff discipline. | 4/5 | 4/5 | `temp/competitor-repos/jesse-black__execplan-skills` | `2026-04-30` (updated) |
| P1 | [obra/superpowers](https://github.com/obra/superpowers) | Composable agent skill methodology for brainstorming, planning, TDD, subagent-driven development, review, and verification-before-completion. | Already integrated; continue syncing upstream and adapt updates into AIOS-native skills and docs. | 4/5 | 4/5 | `temp/competitor-repos/obra__superpowers` | `179914 stars` (2026-05-06) |
| P1 | [revfactory/harness](https://github.com/revfactory/harness) | Meta-skill that turns a domain description into a generated agent team, skills, and orchestrator using reusable team architecture patterns. | Strong reference for improving AIOS orchestrator blueprints and automatically generating project-specific agent/team specs. | 4/5 | 4/5 | `temp/competitor-repos/revfactory__harness` | `3142 stars` (2026-04-18) |
| P1 | [UpGPT-ai/vision-test-harness](https://github.com/UpGPT-ai/vision-test-harness) | MCP + CLI visual test harness using YAML flows, Playwright screenshots, screenshot diffing, privacy overlays, and optional AI visual diagnosis. | Very useful for AIOS browser automation verification, especially UI smoke tests and screenshot-based evidence after browser-flow changes. | 3/5 | 4/5 | `temp/competitor-repos/UpGPT-ai__vision-test-harness` | `2026-04-20` (stable) |
| P2 | [openclaw/openclaw](https://github.com/openclaw/openclaw) | Personal always-on AI assistant/gateway with channels, daemon onboarding, plugins, pairing, skills, and cross-platform user surfaces. | Useful as a reference for daemonized gateway, onboarding, plugin boundaries, and multi-channel future; less direct for current coding-agent core. | 3/5 | 3/5 | `temp/competitor-repos/openclaw__openclaw` | `368841 stars` (2026-05-06) |
| P2 | [ravenpair/ravenpair](https://github.com/ravenpair/ravenpair) | Self-hosted Go server for paired long-running agents with REST/WebSocket APIs, pgvector memory, NATS/Redis, LiteLLM, and plugin-only capabilities. | Useful if AIOS grows into a self-hosted server/control plane; less immediate for current local-first script and CLI runtime. | 3/5 | 3/5 | `temp/competitor-repos/ravenpair__ravenpair` | `2026-02-24` (dormant) |

## Highest-Impact References For AIOS

1. **golutra + Hermes-agent -> HUD/UX acceleration.** golutra's revival (May 1) signals the desktop control-plane category is alive. Combined with Hermes-agent's session-centric UX (134K stars), AIOS should accelerate the HUD evidence panel before golutra defines user expectations. Focus: evidence-rich run cards, screenshot thumbnails, diff percentages, suggested next commands.

2. **OpenHarness + lazy-harness + long-running-tasks + gnhf -> Harness reliability.** All four pushed in the past 48 hours. The combined signal: dry-run readiness verdicts, watchdog recovery with observe/retry/respawn/rollback/human_gate, compact continuity, and worktree-preserving overnight execution. AIOS has the watchdog command already; needs readiness verdicts and recovery decision states.

3. **OpenViking + openclaw-recall -> ContextDB explainability.** OpenViking at 23.5K stars validates context databases as infrastructure. AIOS ContextDB needs explain/hygiene tooling: `contextdb search --explain`, `contextdb prune-noise --dry-run`, `contextdb compact`, with retrieval trajectory and suppression reasons.

4. **oh-my-openagent -> Execution quality.** Hash-anchored edit validation, model-category routing, LSP/AST tools, and continuation enforcement. The edit safety signal is the strongest here: generate stable line/hash anchors for critical files.

5. **execplan-skills (updated Apr 30) + revfactory/harness -> Plan discipline.** Planner/generator/evaluator separation with living ExecPlan artifacts. Fresh update suggests active development. AIOS should enforce plan/checkpoint fields for multi-step work.

6. **vision-test-harness -> Browser/UI verification.** Still the clearest reference for YAML-flow + screenshot-diff + privacy-overlay smoke tests on top of Browser MCP.

## Golutra Similarity Note

golutra is very similar to AIOS at the product direction layer: both keep existing CLIs and add multi-agent orchestration, long-running workflows, context/prompt reuse, and result tracking. The difference is the center of gravity: golutra is a Tauri desktop control plane with visual terminals and workflow templates, while AIOS is currently a local-first CLI/runtime layer around ContextDB, Browser MCP, skills, and orchestrator/team commands. For AIOS, golutra is most valuable as a UX/control-plane reference rather than a direct runtime replacement.

## Gnhf Similarity Note

gnhf overlaps with AIOS most strongly in the overnight execution loop, not in the full product surface. gnhf is intentionally narrow: start from a clean Git repo, run one agent in a disciplined iteration loop, commit successful steps, reset failures, preserve run memory in `.gnhf/runs/`, and optionally fan out separate worktrees for concurrent agents. AIOS is broader: it adds ContextDB, Browser MCP, Privacy Guard, orchestrate/team preflight gates, and a larger local-first control plane. For AIOS, gnhf is a strong reference for default long-running harness behavior and operator UX rather than for memory or browser architecture.

## Resolution Notes

| Input | Resolved repository | Note |
|---|---|---|
| volcengine/OpenViking | [volcengine/OpenViking](https://github.com/volcengine/OpenViking) | Exact owner/repo from user input. |
| openclaw/openclaw | [openclaw/openclaw](https://github.com/openclaw/openclaw) | Exact owner/repo from user input. |
| code-yeongyu/oh-my-openagent | [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | Exact owner/repo from user input. |
| HKUDS/OpenHarness | [HKUDS/OpenHarness](https://github.com/HKUDS/OpenHarness) | Exact owner/repo from user input. |
| vision-test-harness | [UpGPT-ai/vision-test-harness](https://github.com/UpGPT-ai/vision-test-harness) | Resolved by GitHub search: exact repository name with AI/browser visual testing description. |
| revfactory/harness | [revfactory/harness](https://github.com/revfactory/harness) | Exact owner/repo from user input. |
| Lazy-Harness | [lazynet/lazy-harness](https://github.com/lazynet/lazy-harness) | Resolved by GitHub search: exact repository name, cross-platform AI coding agent harness description. |
| kunchenguid/gnhf | [kunchenguid/gnhf](https://github.com/kunchenguid/gnhf) | Exact owner/repo from user input. |
| obra/superpowers | [obra/superpowers](https://github.com/obra/superpowers) | Exact owner/repo from user input; AIOS already uses this system. |
| golutra/golutra | [golutra/golutra](https://github.com/golutra/golutra) | Exact owner/repo from user input. |
| ravenpair/ravenpair | [ravenpair/ravenpair](https://github.com/ravenpair/ravenpair) | Exact owner/repo from user input. |
| openclaw-recall | [Felix201209/openclaw-recall](https://github.com/Felix201209/openclaw-recall) | Resolved by GitHub search: exact repository name. Related alternatives include code-yeongyu/openclaw-memory-auto-recall and speedyfoxai/openclaw-true-recall-base. |
| execplan-skills | [jesse-black/execplan-skills](https://github.com/jesse-black/execplan-skills) | Resolved by GitHub search: exact repository name with multi-agent PLANS.md workflow description. |
| long-running-tasks | [mmTheBest/long-running-tasks](https://github.com/mmTheBest/long-running-tasks) | Resolved by relevance search: OpenClaw skill for multi-phase Codex/Claude Code workflows; exact-name search also found unrelated app examples. |

## Suggested AIOS Roadmap (May 6 Refresh)

### 🔴 Block 1: Operator confidence (next 2 weeks)

These close the gap between AIOS and the converging harness standard (OpenHarness + lazy-harness + gnhf). Every competitor is shipping these now.

1. **Readiness verdicts for `team` / `orchestrate` / browser flows.**
   - `aios team --dry-run` and `aios orchestrate --dry-run` with machine-readable `ready/warning/blocked` + concrete next actions.
   - Reuse the existing `quality-gate.mjs` infrastructure; surface top blocking reason and suggested fix command.

2. **ContextDB explain + hygiene.**
   - `contextdb explain <query>` — show why each memory was recalled, candidate scores, suppression reasons.
   - `contextdb status` — noise counts, source stats, retrieval mode distribution.
   - `contextdb prune-noise --dry-run` / `contextdb compact` — actionable hygiene.

3. **Watchdog recovery decisions.**
   - `aios team watchdog` already exists. Add the recovery decision object: `observe | retry | respawn | rollback | human_gate`.
   - Wire multi-signal detection: commit age, file activity, log freshness, worker process/CPU.

### 🟡 Block 2: Execution quality (next 4 weeks)

These differentiate AIOS in quality, not feature count.

4. **Browser smoke evidence.**
   - `aios browser smoke` — YAML/JSON flows → Playwright screenshots → pixel diff → HTML report in `temp/`.
   - Privacy overlay/redaction before screenshots hit reports.

5. **Plan/ownership preflight gates.**
   - Block `aios team` / `aios orchestrate` when plan/checkpoint/owned path evidence is missing.
   - Surface: "Missing: Progress, DecisionLog, Acceptance, NextActions, evidence paths, blocker state."

6. **Hash-anchored edit validation for critical files.**
   - Generate stable line/hash anchors for generated plans, skills, agents, and critical scripts.
   - Validate before mutating; surface conflicts in `team status`.

### 🟢 Block 3: Productization (next 6-8 weeks)

7. **Evidence HUD.** Upgrade `aios hud` to show: run card, screenshot thumbnail, diff percentage, failed assertion, suggested next command. This directly responds to golutra's desktop UX.

8. **Orchestrator selftest.** `aios doctor --orchestrate` checking: wrapper state, ContextDB writeability, subagent clients, browser MCP, telemetry paths.

9. **Hybrid retrieval + rerank.** Lexical/semantic/hybrid modes with RRF/MMR for ContextDB, with L0/L1/L2 drill-down outputs.

10. **Compact continuity chain.** Pre-compact/session-end summary → post-compact/session-start reinjection through ContextDB continuity module (which already has the file schema).

### Urgency shift from May 4

The May 4 refresh said "prioritize reliability before expansion." The May 6 data **adds urgency specifically to the HUD/UX layer** because golutra's revival means desktop orchestration UX is being actively developed by a similarity-5/5 competitor. Block 1 items 1-3 remain the foundation; Block 2 item 4 (browser smoke) and Block 3 item 7 (evidence HUD) should be pulled forward if golutra ships a polished release.

## Feature Adoption Blueprint

Concrete competitor features mapped to AIOS implementation specs:

### 1. Readiness Verdicts (from OpenHarness + lazy-harness)

**What competitors have:** `ready | warning | blocked` tri-state verdict with concrete next actions before any agent run.

**AIOS implementation:**
- Extend `scripts/lib/lifecycle/quality-gate.mjs` to output a machine-readable readiness object.
- Add `--dry-run` flag to `aios team` and `aios orchestrate`.
- Checks: CLI wrappers present, ContextDB writeable, browser MCP reachable, git clean, plan exists, skill permissions current.
- Output: `{ "verdict": "ready|warning|blocked", "checks": [...], "next_actions": ["run: aios doctor --fix"], "blocker": null|"string" }`

### 2. ContextDB Explain (from OpenViking + openclaw-recall)

**What competitors have:** `viking://` URIs with retrieval trajectory, L0/L1/L2 budgets, memory type taxonomy, `explain` and `prune` commands.

**AIOS implementation:**
- Add `contextdb explain <query>` via `scripts/lib/contextdb-cli.mjs` — for each recalled memory: source file, match type (lexical/semantic/hybrid), score, and suppression reason if skipped.
- Add `contextdb status` — memory count by type, retrieval stats, last compaction, noise estimate.
- Add `contextdb prune-noise --dry-run` — identify candidate-removal memories (zero-access, expired, redundant).
- The continuity module already has schema support; add the CLI surface.

### 3. Watchdog Recovery Decisions (from long-running-tasks + gnhf)

**What competitors have:** Multi-signal stall detection with automated recovery: commit/file/CPU/log freshness checks -> `observe | retry | respawn | rollback | human_gate`.

**AIOS implementation:**
- `aios team watchdog` already exists at `scripts/lib/lifecycle/watchdog.mjs`.
- Add recovery decision engine: after stall detection, classify into one of 5 states with auto-action.
- Add `.pause` file semantics for operator-initiated pause.
- Wire commit-age (git log), file-activity (mtime), worker-process (PID alive), log-freshness (last ContextDB event timestamp).

### 4. Browser Smoke Evidence (from vision-test-harness)

**What competitors have:** YAML flow definitions, Playwright screenshots, pixel diff vs baseline, privacy overlays, HTML reports.

**AIOS implementation:**
- New command: `aios browser smoke --flow <yaml|json> --baseline <dir> --output <dir>`.
- Flow steps: `navigate | click | type | wait | assert_text | assert_element | screenshot`.
- Diff engine: pixel-by-pixel comparison with threshold, HTML report with side-by-side view.
- Privacy overlay: redact email/password/phone/token patterns before screenshots hit disk.

### 5. Plan Ownership Gates (from execplan-skills + oh-my-openagent)

**What competitors have:** Planner/generator/evaluator persona split, required living ExecPlan sections, clean-room evaluation checkpoint.

**AIOS implementation:**
- Add preflight check in `quality-gate.mjs`: for `team` and `orchestrate` commands, require a plan with minimum sections (Progress, DecisionLog, Acceptance, NextActions, evidence paths, blocker state).
- Surface in `team status` as a blocking condition: "Blocked: plan missing Acceptance section."
- Store plan ownership metadata in ContextDB for cross-session visibility.

### 6. Evidence HUD (from golutra + Hermes-agent)

**What competitors have:** golutra's visual desktop dashboard with agent/log inspection, terminal injection, workflow status. Hermes-agent's session-centric Ink TUI with recall + summarization.

**AIOS implementation:**
- Upgrade `aios hud` (`scripts/lib/hud/state.mjs`) to render: active run card, latest screenshot thumbnail (via iTerm2 inline image or ASCII), diff percentage, failed assertion, blocker state, suggested next command.
- Add session-recall view: "Last session: 2026-05-06, 3 runs, 2 passed, 1 blocked. Resume: `aios team --resume <id>`."

### 7. Hash-Anchored Edits (from oh-my-openagent)

**What competitors have:** `hash-anchor` tool that records stable line/content hashes before edits and validates after, preventing drift.

**AIOS implementation:**
- New module: `scripts/lib/verification/hash-anchor.mjs`.
- For critical files (generated plans, skills, agents, orchestrator config), compute hash anchors on each edit.
- Expose in `team status`: "Warning: 3 files have drifted hashes. Run `aios doctor --fix-hash-anchors`."

### 8. Compact Continuity Chain (from lazy-harness)

**What competitors have:** Pre-compact summary saved, post-compact reinjected on session start.

**AIOS implementation:**
- Already partially built: `scripts/lib/contextdb/continuity.mjs` has the file schema.
- Add: before Claude compaction (via pre-compact hook), write continuity summary. On session resume, inject summary into ContextDB context pack.
- The hook trigger: Claude Code's `pre-compact` or session-end event.

### Implementation Ordering Logic

```
Block 1 (weeks 1-2): Readiness Verdicts + ContextDB Explain + Watchdog Recovery
  ↑ Foundation: every other feature depends on these

Block 2 (weeks 3-4): Browser Smoke + Plan Gates + Hash Anchors
  ↑ Differentiator: competitors are converging on Block 1, not on Block 2

Block 3 (weeks 5-8): Evidence HUD + Selftest + Hybrid Retrieval + Continuity
  ↑ UX moat: golutra will ship desktop UX; AIOS should have CLI evidence parity
```

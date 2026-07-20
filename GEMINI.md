<!-- AIOS: .aios/context-db/index.json -->


<!-- AIOS CODEMAP BEGIN -->
## MCP Tools: code-review-graph

This project has a structural knowledge graph. **Use it at each decision point in your workflow.**

### Decision checkpoints (mandatory)

| When | Call | Why |
|------|------|-----|
| Before doing anything | `get_minimal_context(task="...")` | Project context + suggested next steps |
| Before modifying code | `get_impact_radius(detail_level="minimal")` | Check blast radius; if risk=high, re-evaluate plan |
| Before modifying code | `query_graph(pattern="tests_for", target="...")` | Confirm tests exist; if not, write tests first |
| After modifying code | `detect_changes(detail_level="minimal")` | Verify actual impact matches expected |
| Before submitting | `get_affected_flows()` + `get_suggested_questions()` | Final safety net |

### Search rules

- Finding code: `semantic_search_nodes` before grep
- Understanding relationships: `query_graph` (callers_of/callees_of/tests_for) before reading files
- Code review: `detect_changes` → `get_review_context` before reading entire files

### Parameters

- Always use `detail_level="minimal"`; escalate to "standard" only when insufficient
- Follow `next_tool_suggestions` from each response for the next tool to call
<!-- AIOS CODEMAP END -->

<!-- AIOS NATIVE BEGIN -->
<!-- 中文注释：客户端模板同步 MCP 代理和原文召回策略，避免各宿主入口漂移。 -->

AIOS native enhancements are active in this repository.

Use repo-local skills, agents, and bootstrap docs before falling back to ad-hoc behavior.

## AIOS Workflow Policy

Evaluate the work item before creating a plan, selecting a skill, or dispatching agents. The default policy mode is `adaptive`:

- `direct`: questions, read-only analysis, status checks, and empty input. Do not create a persistent plan or invoke a skill chain.
- `guarded`: a small, clear local change. Before an edit, use `pre-edit-safety-gate`; then run focused verification. Do not create a persistent plan solely for this disposition.
- `planned`: an unclear, multi-step, risky, delegated, team, or harness work item. Create or reuse one AIOS plan, then execute only the Provider selected by the current Rex Capability Command.

Short same-session acknowledgements reuse a nonterminal active plan; explicit `continue` / `resume` may reuse one across clients. If no eligible active plan exists, report that condition instead of creating a plan from the acknowledgement. Do not treat a new objective as a continuation.

## Rex Provider and Change Gates

- The current Rex Capability Command is the only authority that selects a software Provider or advances a software stage. A successful Provider run is not enough to advance: return the Command's required evidence to the AIOS Activation Ledger and let Rex evaluate the transition.
- Before a cohesive code, workflow, or migration batch, invoke `pre-edit-safety-gate`: establish a safe Git baseline, refresh CRG when available, and plan reuse, abstraction, encapsulation, decoupling, and clear directory ownership. It supports authorized TDD and refactors.
- `direct` work does not invoke a Provider. `guarded` and `planned` work invoke only the Provider selected by the current Rex Capability Command.
- When workflow surfaces or skills change, collect the required client smoke and skill-training evidence before treating the rollout as ready.

Only Claude has a verified prompt-hook projection. Other clients must not claim a SessionStart or prompt hook; use their native skill discovery, explicit route commands, or the AIOS CLI/MCP policy adapter when available.

## rex-harness Software Workflow

- Control loop: `Observation -> Fact -> Activation -> Command -> Provider -> Evidence`. rex owns the semantic transitions and can persist them independently under `.rex-harness/`; AIOS persists a host projection under `.aios/workflow-activations/`.
- `rex-harness` owns software-engineering Facts, Capability selection, Workflow Activation, stage order, Evidence Contracts, standalone `start/status/evidence/resume`, and portable default Provider hints. AIOS adds `direct | guarded | planned`, final executable Provider Binding, process execution, ContextDB, recovery, safety, Team, and Harness.
- Standalone coding clients load `rex-workflow` and use the compact CLI by default; `--full` is diagnostic-only. AIOS calls the complete rex JS API directly and does not register a core rex MCP server.
- Run only the Provider returned by the current `capabilityDecision`. Do not inject a fixed Provider chain on the first turn.
- AIOS stores the complete rex Workflow Activation under `.aios/workflow-activations/workflows/`; top-level Capability files are compatibility projections. After a Provider returns evidence, advance through the rex runtime instead of reselecting the next stage in AIOS.
- AIOS recipe definitions expose one command-scoped projection of `adaptive-software-delivery`; conditional Capability candidates are not a fixed pipeline and must not all be required at once. AIOS-only runtime and governance recipes remain host-owned.
- AIOS binds only the bundled `rex-*` Skills and `rex-specialist-review`; invoke only the Provider returned by the current Command. External Skills and playbooks may be installed for explicit user requests, but cannot replace a rex Provider or advance a rex Activation.
- `Fast | Balanced | Deep` are post-run analytics derived from actual Activations. They are not request routes and must not be guessed from prompt length or keywords.

## AIOS Interception Runtime (Deprecated)

<!-- 中文注释：原生拦截运行时已废弃，改为使用社区维护的 RTK + Caveman。 -->

- The AIOS native interception runtime is **deprecated**. Code retained for reference, no longer actively maintained.
- Token compression is now handled by community tools: **RTK** (https://github.com/rtk-ai/rtk) and **Caveman** (https://github.com/JuliusBrussee/caveman), installed automatically by `aios init`.
- For migration help, see `.claude/skills/aios-interception-runtime/SKILL.md` (rewritten as RTK/Caveman install guide).

## AIOS Turn Compression Enforcement

- Required metric: `bidirectional-turn-compression`.
- Every AIOS-managed turn must pass through `pre_send` and `post_receive` compression gates.
- Direct host output bypass is a policy violation; use the AIOS-managed runner, MCP proxy, or compact packet path instead.
- Do not claim compression compliance unless both pre-send and post-receive evidence are present.

## AIOS Self-Trigger Routing

- Continue normally in the active coding client for `direct` and `guarded` work.
- Start `team`, `subagent`, or `harness` only after the workflow policy identifies one explicit `planned` work item. Do not dispatch an acknowledgement, a question, or an unscoped conversation.
- For planned independent domains, trigger `aios team ...` or `node <AIOS_ROOT>/scripts/ctx-agent.mjs --route team|subagent ...`; for a planned long-running resumable objective, use `aios harness run --objective "<task>" --worktree --max-iterations 8`.
- Use `aios harness status --session <id>`, `aios hud --session <id>`, `aios harness stop --session <id> --reason "<why>"`, and `aios harness resume --session <id>` for handoff and recovery.
- Do not ask the user to manually trigger AIOS commands unless they requested dry-run/preview or the environment lacks permission to run shell commands.

## Privacy & Relay Safety

- Before sending context to any model or relay service, assume prompts, code snippets, diffs, logs, screenshots, MCP output, and browser-extracted text may leave this machine.
- Never paste or expose API keys, tokens, cookies, sessions, private keys, `.env` files, credential configs, customer data, browser profiles, or unredacted authorization logs.
- For sensitive files, use `aios privacy read --file <path>` and share only the redacted output.
- If a custom model endpoint or relay is detected, warn the user before continuing and avoid sending secrets or proprietary data.
- **RTK/Caveman privacy**: Both tools run locally — no external services. RTK filters command output in-process; Caveman is a prompt skill. The `--yes-compression-tools` flag skips the install confirmation prompt for CI/unattended use.
- LLM privacy instructions are advisory; do not claim strict privacy compliance unless deterministic AIOS gates verified the relevant checks.

## Context System (ContextDB + Registry)

This project uses a pull-based context system. Runtime context is NOT automatically injected into model prompts.
Stable workflow constraints live in checked-in instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and repo-local skills). Runtime state lives in `.aios/` and is loaded only when the user asks to continue or the current task clearly needs it.

### Quick Start
1. On first load, try to read `.aios/context-db/index.json` — the context registry.
2. If the file doesn't exist, this is a fresh session — proceed with the user's task.
3. If it exists, it lists available sources with cost, priority, and tags.
4. Load only the sources relevant to the current task.
5. Default: do not load session history. Load `handoff` only after the user confirms resume/continue or the task explicitly references prior work. Skip `perception` for coding tasks.
6. Legacy `memory/context-db/index.json` is read only for compatibility when `.aios/context-db/` is absent.

Generated AIOS runtime state should stay under `.aios/` (`.aios/context-db`, `.aios/workspace`, `.aios/tasks`). Legacy `memory/context-db`, `memory/workspace`, and `tasks` are compatibility read paths, not fresh-write targets.

### Prompt Injection Policy
- Do not inject ContextDB packets, recent events, checkpoints, handoff prompts, persona overlays, user overlays, or router guides into ordinary startup or one-shot prompts.
- Startup may show a short local unfinished-task summary to the user, but it must not pass that summary as model input.
- `contextdb context:pack` is a manual export/debug tool. It may write files for inspection, but its output is not default prompt input.
- If the user says "continue", "resume", "继续", or selects an unfinished task, read only the listed task/handoff files needed for that continuation.
- Stable rules belong in native instruction files and skills, not in repeated runtime prompt injection.

### Source Selection by Task Type
| Task type | Load |
|-----------|------|
| All task types | project-memory (auto-recall REQUIRED — see Memo Auto-Recall above) |
| Continue previous work | selected task + handoff after user confirmation |
| Code/implement/fix | static instructions + targeted repo search; skip perception/history by default |
| Analyze XHS data | targeted perception only when analytics context is explicitly needed |
| Debug a failure | targeted event/checkpoint search; do not load full session history by default |
| Team/harness route | static workflow instructions + explicit plan/handoff files only |

### Persisting Across Sessions
Before finishing significant work or hitting a blocker:
- `aios memo add "describe progress and next step"`
- `aios memo pin add "critical fact for future sessions"`

Do NOT save routine progress or trivial updates.

### Memo Auto-Recall (MANDATORY — prevents session amnesia)

Before answering any question that may involve project-specific knowledge, run memo recall:

**Trigger keywords** — the user's query contains any of:
- Project architecture, past decisions, conventions, or workflows
- References to previous work, releases, fixes, or changes in this project
- "how does X work", "why was Y changed", "what was the Z fix"
- "怎么实现", "为什么改", "为什么重构", "修过什么", "有什么改动"
- "continue", "resume", "上次", "继续", "之前"
- Reference to any past event, bug, change, or decision in this project
- Any question that starts with vague domain context a fresh session wouldn't know

**Required action** (run BEFORE answering):

1. Run recent-context recall first:
```bash
node scripts/aios.mjs memo recall --limit 5
```

2. If recall returns relevant context, use it and proceed. If recall is empty or the user query is long, distill the query to 2-3 core technical terms before searching:
   - Extract: module names, feature names, file names, technical concepts
   - Strip: conversational filler, instructions to you, formatting
   - Use individual keywords (space = AND in memo search; multi-word queries may produce zero hits if the exact phrase doesn't appear in memos):
```bash
node scripts/aios.mjs memo search "<distilled keyword>" --limit 5
```

3. If the first keyword yields no results, try the next one. Combine the 2 best keywords only when each individually returns relevant hits.

4. Only if memo search also returns nothing should you fall through to Unified Project Search below.

### Memo Scope Rules
Project memory must survive client switches. By default, `aios memo add ...` writes `scope=project_shared`, so Codex, Claude, OpenCode, and Gemini can all recall the same project facts.

Use agent-private memory only for client-specific scratch notes that should not pollute other clients:
- `aios memo add "codex-only scratch note" --scope agent_private --agent codex-cli`
- `aios memo list --agent claude-code` shows project-shared records plus Claude-private records, but not Codex-private records.

Never store global project decisions, architecture facts, task handoffs, release blockers, or user preferences as `agent_private`. Those belong in the default `project_shared` scope or pinned project memo.

### Unified Project Search (mandatory fallback)

**Before any ad-hoc grep or broad file reads**, use unified search to check project memory, docs, plans, and code references:

```bash
node scripts/aios.mjs search "<query>" --agent <runtime-client-id> --json
```

Use `--source memory,plans` for memory plus plan recall, `--source docs,code` for repo reference lookup, and `--scope agent_private --agent <runtime-client-id>` only when intentionally searching that agent's private scratch notes. The command preserves `project_shared` visibility across clients and filters other agents' private memos.

### Persona & User Profile
- `aios memo persona ...` manages `~/.aios/SOUL.md` (agent identity)
- `aios memo user ...` manages `~/.aios/USER.md` (operator preferences)
- These are stable guidance, not task facts. Project-specific facts go through ContextDB.

## AIOS Client Capability Gates

Before using a client for live delegation, training, quality-gate execution, or harness work, check the verified rollout state:

```bash
node scripts/aios.mjs clients doctor --json
```

Interpretation:
- `supported-candidate`: Static projection and live AIOS orchestration are allowed, subject to normal task safety gates.
- `compatibility`: Keep context/skills/native sync working, but avoid new live-only assumptions unless the command output explicitly allows them.
- `pending-smoke`: Treat the client as static-projection-only. Do not launch it for live one-shot work, skill training, quality-gate runner duties, or harness live execution until CLI args, MCP config, and unattended smoke evidence are verified.

## AIOS Token Discipline

AIOS uses native token discipline profiles: `minimal | balanced | full`.

- `minimal`: prefer the smallest useful context; use semantic summaries, scoped reads, and compact handoffs.
- `balanced`: default profile; preserve enough evidence for implementation while avoiding noisy full-output dumps.
- `full`: use only when debugging, auditing, or reviewing requires broader evidence.

Use strategic compact at stable boundaries: after exploration, before implementation; after a milestone; after debugging; before context switch.

Avoid compacting in the middle of implementation, active debugging, or a multi-file refactor where local continuity matters.

Keep MCP surfaces lean. Disable low-value MCP servers when the active client already has enough native tooling.

Token profiles are a pre-context hygiene layer. Deep token compression (output/input/data-plane) is handled by community tools RTK + Caveman, installed via `aios init`.

<!-- 中文注释：code-review-graph（codemap）MCP 决策检查点。所有已注册 MCP 的客户端均下发，让 gemini/opencode 也能用结构图。 -->

## AIOS Code-Review-Graph (codemap) MCP

This project exposes a structural knowledge graph via the `code-review-graph` MCP. Use it at each decision point in your workflow.

- Before doing anything → `get_minimal_context(task="...")` for project context + suggested next steps.
- Before modifying code → `get_impact_radius(detail_level="minimal")` to check blast radius, and `query_graph(pattern="tests_for", target="...")` to confirm tests exist (write tests first if not).
- After modifying code → `detect_changes(detail_level="minimal")` to verify actual impact matches expectations.
- Before submitting → `get_affected_flows()` + `get_suggested_questions()` as a final safety net.
- Finding code → `semantic_search_nodes` before grep. Always use `detail_level="minimal"` and follow each response's `next_tool_suggestions`.

<!-- 中文注释：客户端模板同步 MCP 代理和原文召回策略，避免各宿主入口漂移。 -->

Browser MCP is available through the repo-local AIOS server and should be preferred for browser work.

If RTK/Caveman are installed (via `aios init`), MCP tool output is automatically compressed. If browser output looks raw or huge, verify RTK/Caveman are running: `rtk status` or `caveman status`.

For browser tasks, use this operating pattern unless the user explicitly asks otherwise:
- Connect to a visible CDP browser first: `chrome.launch_cdp` then `browser.connect_cdp`.
- On dense or dynamic pages, prefer `page.semantic_snapshot` first for compact headings/actions before choosing the next step.
- Before acting, read the page state with `page.extract_text`; use `page.get_html` only when text is insufficient.
- Work in short read -> act -> verify loops. Do not chain multiple blind browser actions.
- For clear button/link labels, prefer `page.click_text` before constructing low-level locators.
- Prefer visible text or role-based targets. If a locator is not unique, inspect again and narrow the target instead of guessing.
- After navigation or major actions, use `page.wait` when a state transition is expected, then re-read the page.
- Use `page.screenshot` only as a visual fallback when text/HTML evidence is not enough.
- For complex browser tasks, first summarize the current page, then state the next single action, then execute it.
- When `mcp-browser-use` is available, use its browser-use toolchain (`chrome.*` / `browser.*` / `page.*`) for normal business flows instead of `chrome-devtools`.

<!-- Team provider 指令 — 仅对具备 team capability 的客户端下发 -->

## AIOS Team Provider

When this client is launched by AIOS as a team worker (`ctx-agent.mjs --route team`), it runs in unattended mode. Key behaviors:

- **Work-item scope**: The orchestrator owns the plan and assigns one bounded work item. Do not create a replacement plan or re-run workflow bootstrap inside the worker.
- **Unattended execution**: The client is launched with auto-approve flags (e.g., `--yolo`, `--dangerously-skip-permissions`). Do not prompt for permissions — assume all operations are pre-authorized by the AIOS orchestrator.
- **Model routing**: The `--team-provider` flag and `AIOS_MODEL_ROUTER` env var determine which model each phase uses. Check `AIOS_MODEL_*` env vars for per-role model assignments.
- **Output format**: Results are captured by the AIOS ctx-agent runtime. Produce structured, parseable output — avoid interactive-only output (TUI elements, spinners, progress bars).
- **Error handling**: If a task fails, write a clear error summary to stderr and exit with non-zero code. The orchestrator will handle retries.
- **Scope isolation**: Each team worker owns a specific domain. Do not modify files outside your assigned scope unless explicitly told to.
- **Handoff**: When finished, summarize what was done, what was changed, and any blockers in a concise handoff note.

<!-- Model router 指令 — 仅对具备 team capability 的客户端下发 -->

## AIOS Model Router

AIOS supports per-role model routing in team and subagent workflows. The following environment variables control model selection:

- `AIOS_MODEL_ROUTER` — Set to `1` to enable model routing (default: `0`).
- `AIOS_MODEL_PLANNER` — Model ID for the planner phase (e.g., `gemini-3-pro`).
- `AIOS_MODEL_IMPLEMENTER` — Model ID for the implementer phase (e.g., `gpt-5.5`).
- `AIOS_MODEL_REVIEWER` — Model ID for the reviewer phase (e.g., `claude-opus`).
- `AIOS_MODEL_SECURITY_REVIEWER` — Model ID for the security reviewer phase.

When model routing is active:
1. Read `AIOS_MODEL_ROUTER` at startup to determine if routing is enabled.
2. Use the client's model flag (`-m`, `--model`) to set the assigned model.
3. Record the model used in any dispatch evidence or event logs.
4. If a model env var is unset, fall back to the client's default model.

This enables heterogeneous team workflows where different roles use different LLM providers (e.g., Gemini for planning, Codex for implementation, Claude for review).

<!-- Harness 指令 — 所有客户端都下发 -->

## AIOS Solo Harness

When this client is launched by AIOS solo harness (`aios harness run`):

- The harness owns one explicit `planned` work item. Do not start it for direct questions, acknowledgements, or an unscoped conversation.
- **Objective-driven**: The harness provides a multi-line objective and runs iterative loops. Each iteration should advance toward the objective.
- **Checkpoints**: After each significant change, record progress via `aios memo add`. The harness reads these for recovery.
- **Session state**: All state is persisted in `.aios/context-db/` and `.aios/workspace/`. On resume, read these first to continue where you left off.
- **Iteration budget**: The harness sets `AIOS_HARNESS_MAX_ITERATIONS` (default 8). Respect this limit and wrap up cleanly when approaching it.
- **Worktree isolation**: If `--worktree` is active, changes happen in a git worktree. Commit frequently with clear messages for merge readiness.
- **Evidence**: Before claiming a sub-task is done, produce concrete evidence (test output, file diffs, screenshots). The harness validates evidence before advancing.
- **Failure recovery**: On failure, do not silently retry. Write the error to `aios memo add` with the failure context, then exit. The harness will retry with fresh context.

# AIOS For Gemini

This repository provides compatibility-tier native enhancements for Gemini through repo-local skills and AIOS runtime conventions.

## Agent Self-Trigger

This compatibility projection does not declare prompt hooks. When this client is launched through AIOS shell integration, use the shared workflow policy and continue normal single-agent work for `direct` and `guarded` tasks. Use an injected `team`, `subagent`, or `harness` command only for one explicit `planned` work item.
<!-- AIOS NATIVE END -->

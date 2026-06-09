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

## AIOS Interception Runtime

- Large tool/browser/shell outputs must go through the AIOS interception data plane when an AIOS-controlled surface exists.
- For proof, run `node scripts/aios.mjs interception proof --json`; for repair, run `node scripts/aios.mjs interception doctor --fix`.
- MCP browser tools must be routed as `client -> scripts/aios-mcp-proxy.mjs -> real MCP server`, producing compact packets, raw refs, and metrics.
- Do not claim RTK/Caveman parity without metrics from `.aios/interception/metrics/<session>.jsonl`.

## AIOS Turn Compression Enforcement

- Every AIOS-owned agent turn must satisfy the shared `bidirectional-turn-compression` metric: compress before sending to the target client (`pre_send`) and compress after receiving the client output (`post_receive`).
- Launch live agent work through the AIOS-managed runner (`ctx-agent`, `aios team`, `aios harness`, or an AIOS subagent runtime); direct host execution that bypasses this runner is a policy violation.
- If direct host output or raw uncompressed tool output is observed, stop the live run, record it as `uncontrolled_host_output`, and restart through the AIOS-managed runner instead of accepting the result.
- Do not report token savings for uncontrolled output; compliant savings require compact packets, raw refs, and metrics records for both `pre_send` and `post_receive`.


## AIOS Self-Trigger Routing

- Continue normally in the active coding client for single-domain work.
- If the user asks for delegation, parallel work, or 2+ clearly independent domains, trigger AIOS directly instead of asking the user to run it manually: `aios team ...` or `node <AIOS_ROOT>/scripts/ctx-agent.mjs --route team|subagent ...`.
- If the user asks for a long-running, overnight, resumable, checkpoint-heavy objective, trigger the solo harness directly: `aios harness run --objective "<task>" --worktree --max-iterations 8`.
- Use `aios harness status --session <id>`, `aios hud --session <id>`, `aios harness stop --session <id> --reason "<why>"`, and `aios harness resume --session <id>` for handoff and recovery.
- Do not ask the user to manually trigger AIOS commands unless they requested dry-run/preview or the environment lacks permission to run shell commands.

## Privacy & Relay Safety

- Before sending context to any model or relay service, assume prompts, code snippets, diffs, logs, screenshots, MCP output, and browser-extracted text may leave this machine.
- Never paste or expose API keys, tokens, cookies, sessions, private keys, `.env` files, credential configs, customer data, browser profiles, or unredacted authorization logs.
- For sensitive files, use `aios privacy read --file <path>` and share only the redacted output.
- If a custom model endpoint or relay is detected, warn the user before continuing and avoid sending secrets or proprietary data.
- LLM privacy instructions are advisory; do not claim strict privacy compliance unless deterministic AIOS gates verified the relevant checks.

## Context System (ContextDB + Registry)

This project uses a pull-based context system. Context is NOT injected into every session.
Instead, a lightweight registry index tells you where to find it.

### Quick Start
1. On first load, try to read `.aios/context-db/index.json` — the context registry.
2. If the file doesn't exist, this is a fresh session — proceed with the user's task.
3. If it exists, it lists available sources with cost, priority, and tags.
4. Load only the sources relevant to the current task.
5. Default: load `handoff` for session continuity. Skip `perception` for coding tasks.
6. Legacy `memory/context-db/index.json` is read only for compatibility when `.aios/context-db/` is absent.

Generated AIOS runtime state should stay under `.aios/` (`.aios/context-db`, `.aios/workspace`, `.aios/tasks`). Legacy `memory/context-db`, `memory/workspace`, and `tasks` are compatibility read paths, not fresh-write targets.

### Source Selection by Task Type
| Task type | Load |
|-----------|------|
| Continue previous work | handoff (required) |
| Code/implement/fix | handoff, skip perception/history |
| Analyze XHS data | handoff + perception |
| Debug a failure | handoff + session-history |
| Team/harness route | handoff + task-router |

### Persisting Across Sessions
Before finishing significant work or hitting a blocker:
- `aios memo add "describe progress and next step"`
- `aios memo pin add "critical fact for future sessions"`

Do NOT save routine progress or trivial updates.

### Memo Scope Rules
Project memory must survive client switches. By default, `aios memo add ...` writes `scope=project_shared`, so Codex, Claude, OpenCode, Gemini, Antigravity, and Crush can all recall the same project facts.

Use agent-private memory only for client-specific scratch notes that should not pollute other clients:
- `aios memo add "codex-only scratch note" --scope agent_private --agent codex-cli`
- `aios memo list --agent claude-code` shows project-shared records plus Claude-private records, but not Codex-private records.

Never store global project decisions, architecture facts, task handoffs, release blockers, or user preferences as `agent_private`. Those belong in the default `project_shared` scope or pinned project memo.

### Unified Project Search
Before ad-hoc grep or broad file reads, use unified search when you need project memory, docs, plans, and code references together:

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

Current strict policy: Antigravity and Crush may receive generated instructions/skills, but live execution remains blocked while they are `pending-smoke`. If a task needs those clients, report the blocker and continue with a verified client instead of silently falling back.

<!-- 中文注释：superpowers 流程强制段，仅对具备 superpowers 能力的客户端下发，避免向无此技能的宿主发指令。 -->

## AIOS Superpowers Workflow

- Before any implementation action, route through the superpowers process skills instead of improvising. Invoke the skill — do not paraphrase or inline its process.
  - Design / new behavior / new feature → `superpowers:brainstorming`
  - Multi-step delivery → `superpowers:writing-plans`
  - Debugging / failure analysis → `superpowers:systematic-debugging`
  - Test-first implementation → `superpowers:test-driven-development`
  - About to claim completion → `superpowers:verification-before-completion`
- **Before any code modification** (any edit/create/delete), invoke `pre-edit-safety-gate` — checks CRG impact radius, dependencies, test coverage, and style alignment. CRG graph update + detect_changes + typecheck + test enforced after every edit. This gate applies across ALL task types.
- Use `aios-workflow-router` only as a routing aid; it does not replace the superpowers skills.
- Close a task only after `superpowers:verification-before-completion` passes with concrete artifact evidence.

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

Default MCP routing is proxied through `scripts/aios-mcp-proxy.mjs` so large `tools/call` results are compacted before they reach the agent context. If browser output looks raw or huge, run `node scripts/aios.mjs interception doctor --fix` before continuing.

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
- When `puppeteer-stealth` is available, use its browser-use toolchain (`chrome.*` / `browser.*` / `page.*`) for normal business flows instead of `chrome-devtools`.

<!-- Team provider 指令 — 仅对具备 team capability 的客户端下发 -->

## AIOS Team Provider

When this client is launched by AIOS as a team worker (`ctx-agent.mjs --route team`), it runs in unattended mode. Key behaviors:

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

When this client is launched through AIOS shell integration, continue normal single-agent work by default. For explicit delegation/parallel requests, run the injected `team` or `subagent` AIOS command. For long-running, overnight, resumable objectives, run `aios harness run --objective "<task>" --worktree --max-iterations 8` and use `aios harness status/resume/stop` for handoff.
<!-- AIOS NATIVE END -->

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
AIOS native enhancements are active in this repository.

Use repo-local skills, agents, and bootstrap docs before falling back to ad-hoc behavior.


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

### Persona & User Profile
- `aios memo persona ...` manages `~/.aios/SOUL.md` (agent identity)
- `aios memo user ...` manages `~/.aios/USER.md` (operator preferences)
- These are stable guidance, not task facts. Project-specific facts go through ContextDB.

Browser MCP is available through the repo-local AIOS server and should be preferred for browser work.

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

# AIOS For Gemini

<!-- 中文注释：Gemini 薄壳保持跨客户端一致路由，真实节流依赖 MCP 代理和 refs 数据面。 -->

This repository provides compatibility-tier native enhancements for Gemini through repo-local skills and AIOS runtime conventions.

## Agent Self-Trigger

When this client is launched through AIOS shell integration, continue normal single-agent work by default. For explicit delegation/parallel requests, run the injected `team` or `subagent` AIOS command. For long-running, overnight, resumable objectives, run `aios harness run --objective "<task>" --worktree --max-iterations 8` and use `aios harness status/resume/stop` for handoff.
<!-- AIOS NATIVE END -->

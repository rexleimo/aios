# Repository Guidelines

<!-- WORKFLOW ROUTER - MANDATORY -->
<IMPORTANT>
## Workflow Routing (REQUIRED)

**Before any action, route the task to the appropriate workflow:**

1. **Check task type** by looking for these keywords:
   - 设计/创意/新功能/brainstorm → Use brainstorming workflow
   - 调试/bug/error/debug → Use debugging workflow
   - 并发/并行/agent team/dispatch → Use parallel dispatch workflow
   - 长任务/harness/multi-step → Use harness workflow
   - 实现/implement/开发 → Use implementation workflow
   - 分析/研究/调查 → Use analysis workflow

2. **Invoke `aios-workflow-router` skill** to get the correct workflow.

3. **Do NOT skip this step** - Even simple tasks benefit from proper routing.
</IMPORTANT>
<!-- END WORKFLOW ROUTER -->

## Project Structure & Module Organization
This repository is a local-first AI agent workspace centered on browser automation via MCP.

- `mcp-server/`: TypeScript Playwright MCP server (legacy/compat runtime code).
- `scripts/run-browser-use-mcp.sh`: default MCP launcher that bridges to `/Users/molei/codes/ai-browser-book/mcp-browser-use`.
- `scripts/browser-use-bootstrap.py`: browser-use bootstrap with optional module shims.
- `mcp-server/src/index.ts`: MCP server entry point and tool routing.
- `mcp-server/src/browser/`: browser launcher, profile manager, auth checks, and tool actions.
- `config/`: runtime configuration such as `browser-profiles.json` and safety-related settings.
- `memory/`: JSON knowledge/skills/specs used by agent workflows.
- `docs/plans/`: implementation and design plans.
- `tasks/`: task templates and execution tracking artifacts.

Do not manually edit `mcp-server/dist/`; it is generated output.

## Build, Test, and Development Commands
Run commands from `mcp-server/` unless noted:

- `npm install`: install dependencies.
- `npm run dev`: run MCP server from TypeScript with `tsx`.
- `npm run typecheck`: strict TS type validation (`tsc --noEmit`).
- `npm run build`: compile to `dist/`.
- `npm run start`: run built server (`node dist/index.js`).

Typical local flow:
```bash
cd mcp-server
npm install
npm run typecheck && npm run build
```

## Coding Style & Naming Conventions
- Language: TypeScript (ESM, strict mode).
- Indentation: 2 spaces; keep semicolons.
- File names: kebab-case for action modules (for example `auth-check.ts`), `index.ts` for module entry points.
- For `mcp-server` internals, tool names follow `browser_*`. For default runtime (browser-use), use `chrome.launch_cdp` / `browser.connect_cdp` / `page.*`.
- Keep configuration JSON keys stable; prefer additive changes over renaming.
- Repo-local discoverable skills must live under `.codex/skills/` or `.claude/skills/` (optionally `.agents/skills/` only when the target client actually supports it). Do not invent parallel skill roots such as `.baoyu-skills/*/SKILL.md`; those are non-discoverable and should be plain docs or extension config only.

## Testing Guidelines
Automated suites are available for both root AIOS workflows and `mcp-server`.
Minimum verification for behavior changes:

1. `npm run test:scripts` (repo root)
2. `cd mcp-server && npm run typecheck && npm run test && npm run build`
3. Manual MCP smoke test (`chrome.launch_cdp` -> `browser.connect_cdp` -> `page.goto` -> `page.screenshot` -> `browser.close`) when browser-flow behavior changes

Document manual test steps in PRs when behavior changes.

## Commit & Pull Request Guidelines
Git history follows Conventional Commit style:
- `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`
- Optional scope is common (for example `feat(skills): ...`).

PRs should include:
- concise problem/solution summary,
- affected paths,
- verification evidence (command output or checklist),
- screenshots/log snippets for browser-flow changes,
- linked task/issue when applicable.

## Security & Configuration Tips
- Never commit credentials, cookies, or personal browser profile data.
- Prefer CDP-based profile config in `config/browser-profiles.json` for stable login reuse.
- Preserve human-in-the-loop checks for auth walls and sensitive outbound actions.

## Browser MCP Selection
- In this repo, prefer the `puppeteer-stealth` MCP server alias that now routes to browser-use MCP (`scripts/run-browser-use-mcp.sh`).
- For interactive browser work, use `chrome.launch_cdp {"port":9222,"user_data_dir":"~/.chrome-cdp-profile"}` then `browser.connect_cdp`.
- If multiple browser MCPs are available, do **not** use `chrome-devtools` for normal business flows; reserve it for low-level inspection/debugging only.
- Default reasoning order for page understanding: `page.extract_text` / `page.get_html` first, `page.screenshot` as visual fallback.

## Default Superpowers Route
For substantial user requests, use this route by default:

1. Select process skill before coding:
   - Design/new behavior: `superpowers:brainstorming`
   - Multi-step delivery: `superpowers:writing-plans`
   - Debug/failure analysis: `superpowers:systematic-debugging`
2. Create a plan artifact in `docs/plans/YYYY-MM-DD-<topic>.md`.
3. Apply long-running controls with `aios-long-running-harness`:
   - Lock objective, budgets, stop conditions, and required evidence.
   - Persist progress through ContextDB lifecycle (`init -> session -> event -> checkpoint -> context:pack`).
4. Choose execution mode:
   - 2+ independent problem domains: use `superpowers:dispatching-parallel-agents`.
   - Shared-state or coupled changes: execute sequentially.
   - If real subagents are unavailable in the current runtime, emulate dispatch by splitting domain tasks explicitly and running only safe independent reads/checks in parallel.
   - For repeated multi-agent deliveries, prefer the reusable blueprints in `memory/specs/orchestrator-blueprints.json` and the shared handoff schema before merging parallel outputs.
5. Finish with `superpowers:verification-before-completion`; do not claim success without checkpoint + artifact evidence.

For long tasks, announce the chosen route in the first progress update.

## Agent Shortcut Conventions
- `cap` is a repository shortcut for `commit + push`.
- Trigger: when the user message is exactly `cap`, execute this flow in the current repo.
- Required flow:
  1. `git status --short` and confirm there are changes.
  2. If behavior/commands/workflow changed, sync impacted skill docs first (keep `.codex/skills/*` and `.claude/skills/*` aligned).
  3. `git add -A`.
  4. Commit with a Conventional Commit message from current task context.
  5. If no clear message is available, use fallback `chore: cap snapshot <YYYY-MM-DD>`.
  6. `git push` (or set upstream once when required).
- If there are no changes, report a no-op instead of creating an empty commit.

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

ContextDB remains the shared runtime layer for memory, checkpoints, and execution evidence.

Wrapped `codex` / `claude` / `gemini` / `opencode` sessions receive an AIOS startup route prompt. The agent should self-select `single`, `subagent`, `team`, or `harness` and run the matching AIOS command when the request warrants it.

Persona and user profile memory are part of the same runtime layer:
- `aios memo persona ...` manages the global agent identity file (`~/.aios/SOUL.md` by default).
- `aios memo user ...` manages the global operator preference file (`~/.aios/USER.md` by default).
- `ctx-agent` injects persona and user profile content into the Memory prelude before workspace memo content.
- Treat these files as stable guidance, not task facts; project-specific facts should still go through ContextDB events, checkpoints, or workspace memo.

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

## AIOS Native Codex Layer

- Prefer repo-local `.codex/skills` and `.codex/agents`.
- Keep work grounded in the AIOS runtime and verification flow.
<!-- AIOS NATIVE END -->

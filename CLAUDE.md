# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Project Overview

This is a **Xiaohongshu (小红书) Operations Assistant** - an AI agent framework that uses Claude Code with the repo-local browser MCP (`puppeteer-stealth` alias routed to browser-use MCP) to automate operations on Xiaohongshu (xiaohongshu.com), a Chinese social media platform.

## Core Architecture

```
User Task → Claude Code → repo-local browser MCP (`chrome.launch_cdp` / `browser.connect_cdp` / `page.*`) → Xiaohongshu Web
                     ↓
              Memory System (JSON files)
              - skills/      # Learned skills
              - specs/       # Safety specifications
              - history/     # Operation records
              - knowledge/   # Knowledge base
```

## Directory Structure

```
aios/
├── docs/plans/           # Design and implementation documents
├── memory/               # Memory system (JSON-based)
│   ├── skills/           # Operational skills (publish笔记, 互动操作, 数据分析)
│   ├── specs/            # Safety specifications (行为规范, 风险检测)
│   ├── history/         # Operation history records
│   └── knowledge/       # Knowledge base (敏感词库, 热门话题)
├── tasks/                # Task tracking (pending/done/failed)
└── config/              # Settings (settings.json)
```

## Key Files

- `config/settings.json` - Assistant configuration (limits, behavior, Chrome options)
- `memory/skills/*.json` - Skill definitions for operations
- `memory/specs/*.json` - Safety and risk detection rules
- `docs/plans/*.md` - Design and implementation documentation

## Commands & Operations

This is not a traditional code project with build/test commands. Instead:

1. **Task Execution**: User gives natural language tasks (e.g., "帮我发布一篇笔记", "关注10个博主")
2. **Skill Retrieval**: Claude Code looks up relevant skills in `memory/skills/`
3. **Browser Control**: Uses the repo-local browser-use MCP tools (`chrome.launch_cdp`, `browser.connect_cdp`, `page.*`) to execute operations
4. **Learning**: Results are recorded to `memory/history/` for future improvement

## Images Directory

```
aios/
├── images/              # Generated cover images and illustrations
│   └── (per post)       # Each post should have unique images
...
```

## Image Generation Guidelines

**IMPORTANT**: Each post MUST have unique, matching cover images!

### 配图方式选择

根据内容类型选择合适的配图方式：

| 内容类型 | 推荐方式 | 说明 |
|---------|---------|------|
| 恋爱日常/宿舍故事/情绪变化 | **剧本式多图生成** | 生成4-9张独立画面，像漫画/条漫连贯故事 |
| 干货教程/知识分享 | 单张配图 | 1张封面 + 配图，信息密集 |

### 剧本式多图生成（新）

- 使用 `memory/skills/剧本式多图生成.json`
- 先写分镜剧本，再逐张生成图片
- 每张图是独立完整画面，不是拼接
- 最多支持18张，按剧情顺序上传

### 传统配图生成

- Use `memory/skills/生成小红书配图.json` for image prompts
- Follow the style system: 9 styles × 6 layouts
- Generate 1 cover + 1-2 illustrations per post
- Save images to `aios/images/` folder
- Match image style to content theme:
  - 情感恋爱 → 粉色浪漫系
  - 情绪管理 → 暖黄治愈系
  - 人际关系 → 活泼明亮系
  - 大学成长 → 清新自然系

## Reference Skills

- Auto-Redbook-Skills: https://github.com/comeonzhj/Auto-Redbook-Skills
- baoyu-skills: https://github.com/jimliu/baoyu-skills

## Safety Limits (from specs)

- Daily posts: max 3
- Daily interactions: max 50
- Operation interval: random 5-30 seconds
- Auto-pause on error detection

## Anti-Detection

- Always use anti-detection scripts before any browser operation
- Enable random delays between actions (5-30 seconds)
- Use human behavior simulation skills
- Key files:
  - `config/settings.json` - anti_detection config
  - `memory/skills/反检测脚本.json` - stealth scripts
  - `memory/skills/人类行为模拟.json` - human behavior
  - `config/stealth-chrome-args.json` - Chrome args

## Browser MCP (browser-use CDP)

The project now defaults to **browser-use MCP over CDP**:

### MCP Server

- **Launcher**: `scripts/run-browser-use-mcp.sh`
- **Migration command**: `node scripts/aios.mjs internal browser mcp-migrate`
- **Doctor**: `node scripts/aios.mjs internal browser doctor --fix --dry-run`

### Available Tools

| Tool | Description |
|------|-------------|
| `chrome.launch_cdp` | Launch local Chrome/Chromium with CDP and profile dir |
| `browser.connect_cdp` | Connect to CDP browser and create session |
| `page.goto` | Navigate to URL |
| `page.click` / `page.type` / `page.press` | Interaction primitives |
| `page.extract_text` / `page.get_html` | Text/HTML extraction |
| `page.screenshot` | Take screenshot |
| `browser.close` | Close browser session |
| `diagnostics.sannysoft` | Fingerprint diagnostics snapshot |

### Profile Support

Multi-profile support for isolated browser instances:
- Each profile has independent user data directory
- Config: `config/browser-profiles.json`
- Recommended convention: `default` = CDP fingerprint browser
- Login pages (Google/Meta/Jimeng auth walls) require human completion; automation should resume after login

### Tech Stack

- browser-use + MCP (Python runtime)
- CDP real Chrome profile reuse
- TypeScript
- MCP SDK

## Important Notes

- All normal browser automation should use the repo-local `puppeteer-stealth` MCP alias and browser-use tools (`chrome.launch_cdp` + `browser.connect_cdp` + `page.*`)
- If multiple browser MCPs are installed, reserve `chrome-devtools` for low-level debugging only
- For interactive work, prefer `chrome.launch_cdp {"port":9222}` then `browser.connect_cdp`
- The system maintains a file-based memory system in JSON format
- Before executing any plan, use `superpowers:brainstorming` skill
- When implementing features, use `superpowers:test-driven-development`
- Before claiming completion, use `superpowers:verification-before-completion`

## Default Task Route (Superpowers + Harness)

For substantial tasks, route execution in this order:

1. Process selection
   - `superpowers:brainstorming` for design/new behavior
   - `superpowers:writing-plans` for multi-step implementation
   - `superpowers:systematic-debugging` for failures
2. Write a plan artifact in `docs/plans/YYYY-MM-DD-<topic>.md`.
3. Use `aios-long-running-harness` controls (preflight budgets, evidence checkpoints, retry classes).
4. Persist session state with ContextDB (`init -> session -> event -> checkpoint -> context:pack`).
5. Dispatch strategy
   - Independent domains: use `superpowers:dispatching-parallel-agents`.
   - Coupled/shared-state changes: stay sequential.
   - If no true subagent tool is available, emulate parallelism with explicit domain queues and only safe parallel reads/checks.
6. Close only after `superpowers:verification-before-completion` and concrete artifact evidence.

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

## AIOS Native Claude Layer

- Prefer repo-local `.claude/skills` and `.claude/agents`.
- Keep work grounded in the AIOS runtime and verification flow.
<!-- AIOS NATIVE END -->

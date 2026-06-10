---
name: aios-interception-runtime
description: AIOS native token compression and interception. Use for ALL token optimization — output compression (tight/ultra/precise), input compression (browser/page/tool), MCP proxy routing, raw refs, compact packets, and metrics proof. Replaces RTK/Caveman with native AIOS implementation.
primary: false

installCatalogName: aios-interception-runtime
clients: [codex, claude, gemini, opencode]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, token, compression, interception, output, input]
repoTargets: [codex, claude, gemini, antigravity, opencode, crush]
---

<!-- 中文注释：统一的 token 压缩与拦截运行时。输出压缩、输入压缩、数据面拦截三合一。 -->

# AIOS Interception Runtime

AIOS 的原生 token 优化层，覆盖三个层面：**输出压缩**（agent 写什么）、**输入压缩**（agent 读什么）、**数据面拦截**（自动截获和压缩）。

不安装 RTK、Caveman 或任何竞品。RTK/Caveman 仅作为 prior art 参考。

## Always Read
1. references/runtime-contract.md

## 一、输出压缩 (Output Compression)

压缩回答，不压缩真相。

- Default level: `tight`
- Switch command: `/compress tight|ultra|precise|off`
- User overrides win: `precise mode`、`stop compress`、或任何要求更多细节的请求会禁用当前响应的压缩

### Levels

| Level | Output shape | Use for |
|-------|--------------|---------|
| `tight` | Short sentences, fragments ok, no filler | Normal analysis, code work, status updates |
| `ultra` | One-liners, `A -> B` notation, only evidence/next action | Harness logs, heartbeat updates, checkpoint summaries |
| `precise` | Full explicit wording, no compression | Browser actions, irreversible operations, safety/security warnings |

### Rules
- Drop filler: pleasantries, hedging, repeated setup, generic summaries
- Keep exact: commands, code, errors, file paths, URLs, API names, selectors, dates, numbers
- Prefer: `changed X in path. verified with command. next Y.`
- Do not compress quoted user text, legal/security warnings, or step sequences where order matters

### Auto-Precise Guard
Use `precise` for:
- Browser operation instructions (`page.click`, `page.type`, `page.goto`, selector choice)
- Auth, payment, deletion, publishing, external network, or irreversible actions
- User confusion, contradiction, or repeated clarification
- Any response where missing a qualifier could change behavior

Return to `tight` after the precise segment unless the user requested otherwise.

## 二、输入压缩 (Input Compression)

在数据进入模型之前减少 token。

### Browser Tool Priority

| Priority | Tool | When |
|----------|------|------|
| 1 | `page.semantic_snapshot` | Navigation, buttons, links, current page structure |
| 2 | targeted `page.extract_text` | Specific section, post body, form, comments |
| 3 | full `page.extract_text` | Need page text and no target is known |
| 4 | `page.get_html` | Last resort when text/snapshot lacks required evidence |
| 5 | `page.screenshot` | Visual-only fallback |

### ContextDB Packets
Use built-in strategy in `mcp-server/src/contextdb/core.ts`:
- Command: `npm run contextdb -- context:pack --session <id> --token-budget 1200 --token-strategy balanced`
- Strategies: `legacy`, `balanced`, `aggressive`
- Safety: preserves errors, paths, commands, latest state, and high-signal events before dropping noise

### Structural Filters
When full page text is unavoidable:
- Keep: page title, main content, visible actions, buttons, links, form fields, counts, validation errors, current URL context
- Drop: nav/footer boilerplate, cookie banners, ads, recommendation rails, duplicate cards, social share blocks
- Collapse repeated structures as `N x [pattern]` while keeping one representative item

### CLI/Tool Output
Prefer scoped commands (`rg`, `git diff --stat`, `sed -n`, `head/tail`) instead of dumping full logs.

### XHS Page Rules
- Note page: keep title, author, body, hashtags, like/comment/collect counts, first useful comments
- Profile page: keep username, bio, follower/following counts, note titles, visible tabs
- Search results: keep query, result titles, authors, like counts, first content line; drop promoted/recommended blocks

### Offload Recall
- When previous browser/tool output was offloaded, inspect `aios canvas show --session <id>` first, then use `aios refs grep <pattern> --session <id>` or `aios refs read <node_id>` only for the specific evidence needed
- Prefer canvas + targeted ref reads over loading full historical tool logs

### Verification Guard
Before acting on compressed input, confirm it still contains every actionable element needed for the next action. If any target, state, or error message is uncertain, re-read narrowly with a targeted locator before acting.

## 三、数据面拦截 (Data Plane Interception)

自动截获和压缩，无需手动干预。

### Session Discipline
Every new task about token savings, browser/MCP output size, shell output size, refs, or metrics must re-read `references/runtime-contract.md`. Do not answer with prompt-only advice when a deterministic interception surface is available.

### Task Routing
- Need proof/metrics -> run `node scripts/aios.mjs interception proof --json`
- Need repair/default routing -> run `node scripts/aios.mjs interception doctor --fix`
- Need MCP config migration only -> run `node scripts/aios.mjs interception mcp-migrate`
- Need raw recall -> use `node scripts/aios.mjs refs read <ref_id> --session <session>` or `refs grep`
- Need client capability answer -> cite `config/host-capabilities.json` and doctor output, not assumptions

### Runtime Contract
- Data plane is code, not prompt: `InterceptionEngine -> CompactPacket -> RawRefStore -> MetricsSink`
- MCP clients must route browser tools through `scripts/aios-mcp-proxy.mjs` before the real MCP server
- AIOS-controlled shell/harness calls must route through `scripts/aios-intercept.mjs` or `runShellEnvelope`
- Large raw output must not enter the compact packet; raw bytes are recalled through refs
- Metrics must be written under `.aios/interception/metrics/<session>.jsonl` with `raw_bytes`, `compact_bytes`, `saved_bytes`, and `saving_ratio`

## Red Flags - STOP
- Claiming RTK/Caveman parity without a fresh `interception proof` result
- Reporting token savings without `saved_bytes` and `saving_ratio` evidence
- Calling a client L3 when `config/host-capabilities.json` records a lower level
- Using `page.get_html`, screenshots, or broad shell reads directly when an MCP proxy or AIOS runner can intercept them

## Boundaries
- This is a unified token optimization skill, not a shell hook
- It never rewrites commands or hides risk
- It must surface blockers, uncertainty, and verification gaps even in `ultra` mode

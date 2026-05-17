---
name: aios-browser-compress
description: Use when collecting browser/page/tool input for AIOS and token use matters; prefer semantic snapshots, targeted reads, and native ContextDB token strategies instead of installing RTK.
---

# AIOS Input Compression

Reduce input before it enters the model. AIOS implements this natively; do not install RTK, Caveman, shell hooks, or competitor CLIs. RTK is prior art only.

## Native Surfaces

1. **ContextDB packets**: use the built-in self-contained strategy in `mcp-server/src/contextdb/core.ts`.
   - Command: `npm run contextdb -- context:pack --session <id> --token-budget 1200 --token-strategy balanced`
   - Strategies: `legacy`, `balanced`, `aggressive`.
   - Safety: preserves errors, paths, commands, latest state, and high-signal events before dropping noise.
2. **Browser MCP input**: prefer compact page tools and targeted reads.
3. **CLI/tool output**: ask for scoped output (`rg`, `git diff --stat`, `sed -n`, `head/tail`) instead of dumping full logs.

## Browser Tool Priority

| Priority | Tool | When |
|----------|------|------|
| 1 | `page.semantic_snapshot` | Navigation, buttons, links, current page structure |
| 2 | targeted `page.extract_text` | Specific section, post body, form, comments |
| 3 | full `page.extract_text` | Need page text and no target is known |
| 4 | `page.get_html` | Last resort when text/snapshot lacks required evidence |
| 5 | `page.screenshot` | Visual-only fallback |

## Structural Filters

When full page text is unavoidable:

- Keep: page title, main content, visible actions, buttons, links, form fields, counts, validation errors, current URL context.
- Drop: nav/footer boilerplate, cookie banners, ads, recommendation rails, duplicate cards, social share blocks.
- Collapse repeated structures as `N x [pattern]` while keeping one representative item.
- Strip URL query parameters unless they are needed for the task.
- Mark omissions as `[...N lines skipped]` when omission matters.

## XHS Page Rules

- Note page: keep title, author, body, hashtags, like/comment/collect counts, first useful comments.
- Profile page: keep username, bio, follower/following counts, note titles, visible tabs.
- Search results: keep query, result titles, authors, like counts, first content line; drop promoted/recommended blocks.

## Offload Recall

- When a previous browser/tool output was offloaded, inspect `aios canvas show --session <id>` first, then use `aios refs grep <pattern> --session <id>` or `aios refs read <node_id>` only for the specific evidence needed.
- Prefer canvas + targeted ref reads over loading full historical tool logs into the model.

## Verification Guard

Before acting on compressed input, confirm it still contains every actionable element needed for the next action. If any target, state, or error message is uncertain, re-read narrowly with a targeted locator before acting.

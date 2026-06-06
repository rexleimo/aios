---
title: "v1.50.0: Unified AIOS Search Across Memory, Docs, Plans, and Code"
description: "Harness CLI v1.50.0 gives every supported coding client one search path for project memory, pinned memo, documentation, plans, and code with scoped visibility."
date: 2026-06-04
tags: ["release", "search", "contextdb", "memory", "multi-client", "AIOS"]
---

# v1.50.0: Unified AIOS Search Across Memory, Docs, Plans, and Code

Agents lose intelligence when they have to rediscover the same project facts in different places. A coding agent might remember a plan, miss a pinned memo, scan docs too late, then grep the codebase without the context that explains why a pattern exists.

Harness CLI v1.50.0 makes that loop shorter. The new AIOS search surface lets every supported client ask one question across the project knowledge layer: memory, pinned memo, docs, plans, and code.

## The Main Command

Run search from the repository root:

```bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
```

The `--agent` flag is important. It tells AIOS which runtime client is asking, so search can safely mix shared project memory with client-specific private notes.

Supported runtime client ids are:

- `codex-cli`
- `claude-code`
- `gemini-cli`
- `antigravity-cli`
- `opencode-cli`
- `crush-cli`

## Search Only the Sources You Need

Broad search is useful at the start of a task. Focused search is better once you know where the answer should live.

```bash
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
node scripts/aios.mjs search "private scratch" --scope agent_private --agent claude-code
```

Available source filters are `memory`, `plans`, `docs`, `code`, and `all`.

## Memory Visibility Rules

v1.50.0 keeps cross-client collaboration and identity isolation separate:

- `project_shared` records are visible to every client.
- `agent_private` records require a matching `--agent <runtime-client-id>`.
- Searches without the matching agent do not leak private records.

That means you can switch from Codex to Claude or OpenCode without losing global project memory, while still keeping per-agent scratch notes scoped to the client that created them.

## Every Client Gets the Same Guidance

The search workflow is now projected into the native instruction surface each client actually reads:

| Client | Instruction surface |
| --- | --- |
| Codex | `AGENTS.md` |
| Claude | `CLAUDE.md` |
| Gemini | `GEMINI.md` |
| Antigravity | `GEMINI.md` |
| OpenCode | `AGENTS.md` |
| Crush | `AGENTS.md` |

Antigravity and Crush still carry `pending-smoke` status for live execution in this release, but their static search guidance is generated and verified with the same client registry as the other runtimes.

## Recommended Agent Workflow

Before a broad file scan, ask AIOS search first:

```bash
node scripts/aios.mjs search "what did we decide about search visibility" --agent codex-cli
```

Then narrow the result:

```bash
node scripts/aios.mjs search "agent_private" --source memory,docs --agent codex-cli --json
```

Use code search after the memory and docs layer tells you which implementation area matters. This preserves the agent's reasoning budget and keeps project decisions visible across sessions.

## Resource Integrity Checklist

For release work, verify the public surfaces together:

```bash
npm run check:site-sync
node --test scripts/tests/native-agent-guidance.test.mjs scripts/tests/client-registry.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/search.test.mjs
git diff --check
```

If MkDocs is installed, also build both sites:

```bash
mkdocs build --strict
mkdocs build -f mkdocs.blog.yml --strict
```

See the [ContextDB search docs](https://cli.rexai.top/contextdb/#unified-project-search-v1500) for the reference guide.

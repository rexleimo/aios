# AIOS Codemap — Deep CRG Integration Design

Date: 2026-05-21
Status: DRAFT
CRG Source: https://github.com/tirth8205/code-review-graph
CRG Version analyzed: latest (commit as of 2026-05-21)

## Problem

AIOS agents explore codebases via grep/glob/read — expensive, slow, and blind to structure. code-review-graph (CRG) solves this with a Tree-sitter knowledge graph, but requires manual setup per project and per client. We need a zero-friction bridge that:

1. Installs and configures CRG for **all** AIOS-supported clients (opencode/codex/claude/gemini) in one command
2. Embeds CRG capabilities into AIOS lifecycle (harness, team, doctor, code review)
3. Makes graph-first exploration the default for all agents, invisible to the user

## Decision: uvx runtime

CRG runs via `uvx code-review-graph serve` — no global Python install needed, uv manages its own environment. The MCP config will use:

```json
{
  "command": "uvx",
  "args": ["code-review-graph", "serve"],
  "type": "stdio",
  "env": {}
}
```

Fallback chain: uvx → pipx → pip (warn).

---

## Architecture

### New AIOS internal target: `codemap`

Registered alongside `shell`, `skills`, `native`, `browser`, `superpowers` as a first-class AIOS component.

```
aios internal codemap install    # full setup
aios internal codemap uninstall  # teardown
aios internal codemap doctor     # health check
aios internal codemap build      # full rebuild — re-parses entire codebase from scratch
aios internal codemap update     # incremental — only re-parses changed files (<2s)
aios internal codemap status     # graph stats
```

**build vs update：**
- `build` — 全量重建，适合首次安装、大范围重构后、或图谱损坏需要重置时
- `update` — 增量更新，只解析变动文件，通常 <2 秒；适合 merge PR 后手动刷新、或日常开发中想确认图谱是最新的

**自动更新机制（补充手动操作）：**
- opencode：`crg-plugin.ts` 监听 `file.edited` 自动 update，`git commit` 前自动 detect-changes
- 其他客户端（codex/claude/gemini）：可在 git hooks 或 CI 中加 `aios internal codemap update`
- harness worktree 流程会自动在 worktree 中 build/update

Shortcut wrappers (same pattern as `install-browser-mcp.sh`):
```
scripts/install-codemap.sh   → aios internal codemap install
scripts/doctor-codemap.sh    → aios internal codemap doctor
```

### Component file: `scripts/lib/components/codemap.mjs`

Single module, same pattern as `browser.mjs`. Exported functions:

| Export | Purpose |
|--------|---------|
| `installCodemap({ rootDir, projectRoot, dryRun, io })` | Full install pipeline |
| `uninstallCodemap({ rootDir, projectRoot, io })` | Remove MCP configs + state |
| `doctorCodemap({ rootDir, projectRoot, fix, dryRun, io })` | Health check |
| `buildCodemap({ rootDir, projectRoot, io })` | Build graph |
| `updateCodemap({ rootDir, projectRoot, io })` | Incremental update |
| `statusCodemap({ rootDir, projectRoot, io })` | Show graph stats |

### State file: `.aios/codemap.json`

```json
{
  "version": 1,
  "installedAt": "2026-05-21T...",
  "runtime": "uvx",
  "crgVersion": "0.x.x",
  "graphBuilt": true,
  "clients": ["opencode", "codex", "claude", "gemini"]
}
```

---

## Install Pipeline (Step by Step)

`aios internal codemap install` does this in order:

### Step 1: Prerequisite check
- Verify `uv` is installed (`uv --version`). If missing, print install instruction and abort.
- Verify project has source code to index (git repo with tracked files, or at least 1 source file).
- Idempotent: if `.aios/codemap.json` exists and version matches, skip to MCP config update.

### Step 2: Verify CRG available via uvx
- Run `uvx code-review-graph --version` to confirm it works.
- Cache the resolved version in `.aios/codemap.json`.

### Step 3: Build initial graph
- Run `uvx code-review-graph build` in the project root.
- This creates `.code-review-graph/` with the SQLite graph database.
- Typical time: 5-15 seconds for most projects.

### Step 4: Inject MCP config for all clients

For each selected client, write the CRG MCP server entry. `install --client all`
creates missing client config files so a fresh project does not silently skip a
client.

**codex-cli** — `~/.codex/config.toml`:
```toml
[mcp_servers.code-review-graph]
command = "uvx"
args = ["code-review-graph", "serve"]
cwd = "<project>"
type = "stdio"
```

**claude-code** — project `.mcp.json`:
```json
"code-review-graph": {
  "command": "uvx",
  "args": ["code-review-graph", "serve"],
  "cwd": "<project>",
  "type": "stdio"
}
```

**gemini-cli** — project `.gemini/settings.json`:
```json
"code-review-graph": {
  "command": "uvx",
  "args": ["code-review-graph", "serve"],
  "cwd": "<project>"
}
```

**opencode** — `~/.config/opencode/opencode.json`:
```json
"mcp": {
  "code-review-graph": {
    "type": "local",
    "command": ["uvx", "code-review-graph", "serve"],
    "enabled": true
  }
}
```

The OpenCode target is global because current OpenCode reliably reads
`~/.config/opencode/opencode.json`; project `.opencode.json` was not sufficient
in CLI smoke tests.

### Step 5: Install opencode plugin (auto-incremental update)

Run `uvx code-review-graph install --platform opencode` which:
- Writes `~/.config/opencode/plugins/crg-plugin.ts`
- Plugin hooks: `file.edited` → `update`, `session.created` → `status`, `tool.execute.before` (git commit) → `detect-changes`

### Step 6: Write `.aios/codemap.json` state file

Record install metadata for doctor/uninstall.

### Step 7: Update client instruction files with graph-first guidance

Append a marker-managed `## MCP Tools: code-review-graph` section to
`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` if not already present. This section
tells all agents to prefer CRG tools over grep/glob/read when exploring code.
Exact content:

```markdown
## Code Review Graph (CRG)

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
```

---

## Deep Workflow Integration

### 1. Doctor suite (`aios doctor`)

Add `doctor:codemap` gate to `runDoctorSuite()` in `scripts/lib/doctor/aggregate.mjs`.

Checks:
- `uv` installed and in PATH
- CRG available via `uvx code-review-graph --version`
- `.code-review-graph/` directory exists in project
- Graph has nodes (not empty): `uvx code-review-graph status` returns non-zero node count
- MCP config present in at least one client
- `.aios/codemap.json` exists and is valid JSON
- opencode plugin installed (if opencode is detected)

Fix mode (`--fix`): rerun `installCodemap` to heal missing pieces.

### 2. Harness integration (`aios harness run`)

In `scripts/lib/lifecycle/harness.mjs`, after `prepareSoloWorktree()`:

- If `.aios/codemap.json` exists in the source repo, run `uvx code-review-graph build` in the worktree after checkout
- At each iteration start, run `uvx code-review-graph update --skip-flows` to keep graph fresh
- In the run journal metadata, record whether codemap was active

This gives the harness agent a live structural map of the code in its worktree.

### 3. Team dispatch integration (`aios team`)

In `scripts/lib/lifecycle/orchestrate.mjs`, when building the dispatch plan:

- If codemap is active, run `uvx code-review-graph detect-changes --brief` to get risk-scored change analysis
- Include the change impact summary in the dispatch context sent to each worker
- Workers can use `get_impact_radius` to understand their task's blast radius

### 4. Client-doc graph-first guidance

Installed in Step 7 of the install pipeline. Makes every agent session automatically prefer CRG tools.

### 5. Skill integration: embed CRG into existing AIOS skills

Do NOT create CRG as a standalone skill that sits parallel to existing ones. Instead, **weave CRG capabilities into existing AIOS skills** so agents use them automatically when those skills trigger.

#### Core principle: decision-point intervention

An agent doesn't think "I should use CRG now." An agent thinks "I need to fix this bug" or "I need to review this code." CRG must intervene at the agent's natural decision points:

```
Agent lifecycle:

  Receive task → [Decision 1: Where am I?] → Understand code → [Decision 2: What to change?] →
  Plan → [Decision 3: Will this break things?] → Write code → [Decision 4: Did I break things?] →
  Verify → [Decision 5: Did I miss anything?] → Submit → [Decision 6: What does review say?]
```

#### Decision 1: "Where am I?" — agent receives task

**Rule**: Before doing anything, call `get_minimal_context(task="<user's question>")`.

This single call gives the agent: project structure, risk level, relevant communities, and `next_tool_suggestions`. It replaces the typical "read README → ls → grep main" startup.

**Implementation**: client instruction-file first rule, before any other instruction.

#### Decision 2: "What to change?" — agent locates modification targets

**Rule**: Use `semantic_search_nodes` instead of grep when looking for functions/classes. Before deciding to modify a function, check `query_graph(pattern="callers_of")` — if it has >10 callers, reconsider whether modifying the function is the right approach vs. changing the call sites.

**Why this changes agent behavior**: This information changes the agent's modification strategy. A function with 47 callers needs a different approach than one with 3 callers. Grep cannot provide this.

#### Decision 3: "Will this break things?" — agent is about to write code

**Rule (mandatory pre-write checkpoint)**: Before writing any code:

1. `get_impact_radius(detail_level="minimal")` → see blast radius
2. If risk="high", re-evaluate the modification plan
3. `query_graph(pattern="tests_for")` → confirm there are tests to verify
4. If no test coverage exists, write tests first

This is "measure twice, cut once" for agents. It is NOT optional — the skill must enforce this.

#### Decision 4: "Did I break things?" — agent wrote code

**Rule**: After any code modification, call `detect_changes(detail_level="minimal")` to confirm actual impact matches expected impact.

This is the empirical check after the predictive check in Decision 3. The opencode plugin already triggers `update` on `file.edited`, but the agent also needs to actively check what its changes affected.

#### Decision 5: "Did I miss anything?" — agent is about to submit

**Rule**: Before submitting, call `get_affected_flows()` + `get_suggested_questions()` as a final safety net.

#### Decision 6: "What does review say?" — code review

**Rule**: This is handled by enhancing the `requesting-code-review` skill with CRG calls (see below).

#### Skill enhancement map

| Existing AIOS Skill | CRG Enhancement |
|---|---|
| `search-first` | Add `semantic_search_nodes` + `query_graph` as preferred search method before grep/glob |
| `debug` / `debug-hub` | Add `get_flow` + `query_graph(callees_of)` for call-chain tracing |
| `requesting-code-review` | Add `detect_changes` + `get_review_context` + `get_impact_radius` as review tools |
| `systematic-debugging` | Add `semantic_search_nodes` + `detect_changes` for evidence collection |
| `brainstorming` | Add `get_architecture_overview` + `get_hub_nodes` for project understanding |

#### Reference skill: `aios-codemap-ops`

Keep this as a **reference/lookup skill** — a quick reference for CRG tool names, parameters, and patterns. It does NOT define workflows (those live in the enhanced skills above). It answers "what's that CRG tool called again?" and "what patterns does query_graph support?"

Content:
- Tool name → parameter quick reference
- `query_graph` patterns: callers_of, callees_of, imports_of, importers_of, children_of, tests_for, inheritors_of, file_summary
- `detail_level` guidance: always start with "minimal", escalate to "standard" only when needed
- `refactor_tool` modes: rename, dead_code, suggest
- Confidence tiers: EXTRACTED (certain), INFERRED (likely), AMBIGUOUS (guess)

This skill is synced to `.opencode/skills/` and `.codex/skills/` via existing `sync-skills.mjs`.

#### How this achieves real behavior change

The token reduction doesn't come from "CRG returns fewer tokens than grep." It comes from **changing the agent's decision process**:

- Without CRG: agent reads files to understand impact → modifies code → reads more files to verify → may miss something → rework
- With CRG: agent queries graph for impact → makes informed decision → modifies code → queries graph to verify → confident

The graph doesn't just save tokens per query — it **eliminates entire rounds of blind exploration** that grep-based workflows require. CRG's measured benchmarks show 4.9x–27.3x token reduction across real repos, averaging 8.2x. The extreme monorepo funnel (27,732 → 15 files) achieves 49x, but that's exceptional. Small single-file changes can be worse with CRG (0.7x on express) because graph metadata overhead exceeds raw file size.

The real value beyond token reduction is **structural intelligence that grep cannot provide**: callers_of, tests_for, blast radius, execution flows, hub/bridge detection, surprising connections. These change the quality of agent decisions, not just the cost.

---

## CRG Feature Coverage Map

All 28 MCP tools + 5 prompts + CLI commands, mapped to AIOS touchpoints:

| CRG Capability | AIOS Touchpoint | Used By |
|---|---|---|
| `build_or_update_graph_tool` | install, harness, team | codemap install, harness worktree |
| `get_minimal_context_tool` | AGENTS.md guidance | all agents (every session) |
| `get_impact_radius_tool` | AGENTS.md guidance, team | code review, dispatch |
| `get_review_context_tool` | AGENTS.md guidance, skill | code review |
| `query_graph_tool` | AGENTS.md guidance, skill | all exploration |
| `traverse_graph_tool` | skill | deep navigation |
| `semantic_search_nodes_tool` | AGENTS.md guidance, skill | all exploration |
| `embed_graph_tool` | manual | optional semantic search |
| `list_graph_stats_tool` | doctor, status | health check |
| `get_docs_section_tool` | skill | workflow docs |
| `find_large_functions_tool` | skill | refactor audit |
| `list_flows_tool` | skill | architecture audit |
| `get_flow_tool` | skill | debug, audit |
| `get_affected_flows_tool` | team dispatch, skill | impact analysis |
| `list_communities_tool` | skill | architecture audit |
| `get_community_tool` | skill | architecture audit |
| `get_architecture_overview_tool` | AGENTS.md guidance, skill | onboarding, exploration |
| `detect_changes_tool` | team dispatch, skill, opencode plugin | code review |
| `get_hub_nodes_tool` | skill | architecture audit |
| `get_bridge_nodes_tool` | skill | architecture audit |
| `get_knowledge_gaps_tool` | skill | quality audit |
| `get_surprising_connections_tool` | skill | architecture audit |
| `get_suggested_questions_tool` | skill | review prep |
| `refactor_tool` | skill | safe refactoring |
| `apply_refactor_tool` | skill | safe refactoring |
| `generate_wiki_tool` | skill | documentation |
| `get_wiki_page_tool` | skill | documentation |
| `list_repos_tool` | multi-repo | multi-repo registry |
| `cross_repo_search_tool` | multi-repo | cross-repo search |
| MCP prompts (5) | skill reference | review/architecture/debug/onboard/pre-merge |
| CLI `build` | install, harness | initial graph build |
| CLI `update` | harness iteration, opencode plugin | incremental refresh |
| CLI `status` | doctor, AGENTS.md | health check |
| CLI `detect-changes` | team dispatch, opencode plugin | pre-commit analysis |
| CLI `visualize` | manual | graph visualization |
| CLI `watch` | opencode plugin | auto-update |
| CLI daemon | manual | multi-repo daemon |

**Coverage: 28/28 tools + 5/5 prompts + all CLI commands = 100%**

---

## Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `scripts/lib/components/codemap.mjs` | Core component: install/uninstall/doctor/build/update/status |
| `scripts/install-codemap.sh` | Shell wrapper → `aios internal codemap install` |
| `scripts/doctor-codemap.sh` | Shell wrapper → `aios internal codemap doctor` |
| `.claude/skills/aios-codemap-ops/SKILL.md` | Unified CRG skill |
| `.opencode/skills/aios-codemap-ops/SKILL.md` | Synced copy |

### Modified files

| File | Change |
|------|--------|
| `scripts/lib/cli/parse-args.mjs` | Add `codemap` to `INTERNAL_TARGETS` |
| `scripts/lib/cli/help.mjs` | Add codemap to internal help + root help examples |
| `scripts/aios.mjs` | Add `codemap` handler in `runInternal()` |
| `scripts/lib/doctor/aggregate.mjs` | Add `doctor:codemap` gate |
| `scripts/lib/lifecycle/harness.mjs` | Add codemap build/update in worktree flow |
| `scripts/lib/lifecycle/orchestrate.mjs` | Add codemap detect-changes in team dispatch |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | Add CRG graph-first section (by install, not hardcoded) |
| `.aios/codemap.json` | Runtime state (created by install, gitignored) |

---

## CLI Surface

```
# Full install (one command, all clients)
aios internal codemap install

# Health check
aios internal codemap doctor
aios internal codemap doctor --fix

# Graph operations
aios internal codemap build
aios internal codemap update
aios internal codemap status

# Teardown
aios internal codemap uninstall

# Shorthand via wrapper scripts
scripts/install-codemap.sh
scripts/doctor-codemap.sh
```

---

## Error Handling

- `uv` not found: clear error + install instructions (`brew install uv` / `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- `uvx code-review-graph` fails: check network, suggest `uv cache clean` + retry
- Build fails (no parsable code): warn and continue; MCP tools will return empty results
- MCP config write fails (permission): warn per-client, continue with remaining clients
- Client instruction file already has CRG section: skip (idempotent by marker comment)
- Doctor finds stale graph: suggest `aios internal codemap update`

---

## Uninstall

`aios internal codemap uninstall`:
1. Remove `code-review-graph` entry from all client MCP configs
2. Remove `~/.config/opencode/plugins/crg-plugin.ts` if it was installed by us
3. Remove `.aios/codemap.json`
4. Remove the CRG section from client instruction files (by marker)
5. Do NOT delete `.code-review-graph/` (user's graph data, may be valuable)

---

## Security & Safety Review

### Operations that MODIFY user files

| Operation | Files affected | Reversibility | Risk |
|-----------|---------------|---------------|------|
| `build` | Creates `.code-review-graph/` (SQLite + .gitignore) | Delete directory | **None** — new dir, gitignored |
| `update` | Updates `.code-review-graph/graph.db` only | Delete & rebuild | **None** — no source files touched |
| Client docs append | Adds CRG section (by marker) to `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | Remove marker section | **Low** — append-only, marker-based |
| MCP config inject | `~/.codex/config.toml`, `.mcp.json`, `.gemini/settings.json`, `~/.config/opencode/opencode.json` | Remove `code-review-graph` entry | **Medium** — modifies user config files |
| opencode plugin | `~/.config/opencode/plugins/crg-plugin.ts` | Delete file | **Low** — new file, no overwrite |
| `apply_refactor_tool` (CRG native) | Source files | git checkout | **Medium** — **not triggered by AIOS** |

### Operations that NEVER touch user data

- `status`, `doctor`, `detect-changes`, `get_*`, `query_graph`, `semantic_search`, `list_*` — all read-only
- `.aios/codemap.json` — new file in gitignored `.aios/` directory

### Critical safety guards (MUST implement)

1. **MCP config write: backup before modify**
   - Before writing to existing client config files, create a `.bak` copy
   - If JSON parse fails on existing file, abort with error — never overwrite a corrupt config
   - Pattern: same as `browser.mjs` `migrateOneMcpJsonFile()`

2. **AGENTS.md: marker-based, never destructive**
   - Wrap the CRG section with `<!-- AIOS CODEMAP BEGIN -->` / `<!-- AIOS CODEMAP END -->`
   - Append only; if markers found, replace in-place (preserving surrounding content)
   - Never rewrite the entire file

3. **Uninstall: preserve user data**
   - Keep `.code-review-graph/` (user's graph data)
   - Keep `.code-review-graphignore` if user created one
   - Only remove: MCP config entries, plugin, `.aios/codemap.json`, CRG instruction sections

4. **`apply_refactor_tool` guard**
   - CRG's `apply_refactor_tool` can modify source files (rename refactoring)
   - This is a CRG-native MCP tool, NOT called by `aios internal codemap *` commands
   - Guard: client instruction sections must document that `apply_refactor_tool` requires explicit user approval and should be preceded by `git add` for easy rollback
   - AIOS codemap component never calls `apply_refactor_tool` automatically

5. **Never delete without confirmation**
   - `uninstall` removes configs but prints exactly what was removed
   - `doctor --fix` heals but never deletes user data
   - No `rm -rf` of any directory containing user source code

6. **Network isolation**
   - `uvx` downloads CRG from PyPI on first use — one-time network access
   - After that, CRG runs fully offline (Tree-sitter grammars are bundled)
   - Embeddings feature (`embed_graph_tool`) is optional and requires explicit opt-in
   - MCP server communicates via stdio only — no HTTP server unless user explicitly runs `serve --http`

### What this design does NOT do

- Does not install global Python packages (uses uvx isolated env)
- Does not modify system PATH or shell rc files
- Does not write to any directory outside: project root, `~/.config/opencode/`, and client config paths
- Does not create background services or daemons (unless user explicitly opts into `crg-daemon`)
- Does not send code or telemetry to any external service

---

## Future Extensions (out of scope for v1)

- ContextDB source type `codemap` for storing graph snapshot metadata
- `aios setup --components codemap` integration
- `aios update --components codemap` for CRG version upgrades
- Multi-repo daemon (`crg-daemon`) managed via `aios internal codemap daemon start/stop`
- Embedding-powered semantic search (requires `pip install code-review-graph[embeddings]`)
- `.code-review-graphignore` auto-generation from `.gitignore`

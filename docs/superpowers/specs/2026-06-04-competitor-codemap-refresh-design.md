# Competitor Codemap Refresh — Design (2026-06-04)

## Goal

Refresh the AIOS competitor watchlist with **code-level evidence** (not just README/CHANGELOG claims) by combining the existing `competitor-watchlist.json` source of truth with `code-review-graph` MCP analysis. Produce a roadmap-ready report that compares 2026-05-22 baseline with fresh 2026-06-04 signals and identifies AIOS gaps that are actionable now.

## Context

- **Source of truth**: `docs/reports/competitor-watchlist.json` (schema v2, 5 categories, 14 competitors, last updated 2026-05-22).
- **Previous deep-dive**: `docs/reports/2026-05-22-competitor-review-brief.md` (5-way parallel agent, README+source+CHANGELOG+ROADMAP, no code execution).
- **Existing plans**: `docs/plans/2026-04-25-competitor-feature-roadmap.md`, `docs/plans/2026-05-10-competitor-refresh-agent-optimization.md`, `docs/plans/2026-05-14-competitor-prompting-improvements.md`.
- **Working dir convention**: `temp/competitor-repos/<owner>__<name>/` for shallow clones.
- **AIOS self-graph**: `.code-review-graph/` already built for the AIOS repo.
- **Tooling**: `code-review-graph` MCP server is registered and operational in this environment.

## Why now

13 days since last refresh. Two `lastPush` fields in the watchlist already point to 2026-05-22, so several competitors may have shipped post-brief. Code-review-graph was not used in the previous refresh, so we may be missing structural evidence (e.g., "gnhf claims iteration notes — does it actually commit on every iteration?"). Upgrading from text inference to graph evidence makes the roadmap more honest.

## Scope

### In scope

- 14 competitors across 5 categories from `competitor-watchlist.json`.
- Re-clone (or refresh) shallow copies of all P0 + active P1 repos.
- Build code-review-graph for each, run stats + targeted deep-dive queries.
- Compare 2026-06-04 findings with 2026-05-22 brief; mark NEW vs already-known.
- Cross-reference AIOS source via `query_graph` to find concrete gaps.
- Produce roadmap with priority + cost + evidence citation.

### Out of scope

- Adding new competitors outside the watchlist (allowed only as Phase 1 signal note, not built into graph).
- Running/verifying competitor binaries (no install, no smoke test).
- Implementing any roadmap item in this task (only the analysis report).
- Touching AIOS source code.

## Workflow

### Phase 1 — Metadata refresh (parallel reads)

- For each of 14 competitors: `webfetch` GitHub API for stars / forks / `pushed_at` / latest release.
- Detect: new releases since 2026-05-22, priority drift, dormant repos to mark.
- **Output**: inline diff in the report; do not mutate the watchlist JSON (keep as snapshot).

### Phase 2 — Shallow clone + graph stats (parallel clones)

- For each P0 + active P1 (skip `dormant` P2): `git clone --depth 1 --filter=blob:none` into `temp/competitor-repos/<owner>__<name>/`.
- For each clone: `build_or_update_graph` with `postprocess="minimal"` (signatures + FTS only, no flows/communities).
- For each: `list_graph_stats` + `get_architecture_overview(detail_level="minimal")`.
- **Triage table**: `repo | nodes | edges | langs | files | communities | priority`.
- **Skip rule**: if a clone errors (private, 404, too large to clone in budget), mark and continue.

### Phase 3 — Deep dive top picks (parallel MCP calls)

- From Phase 2 triage, select **top 5–8**: weight = `priority × log(nodes) × (1 + churn)`.
- For each top pick: re-run `build_or_update_graph` with `postprocess="full"`.
- For each top pick, run in parallel:
  - `semantic_search_nodes` with capability keywords: `["context store", "memory", "mail bus", "dry-run", "compaction", "harness", "checkpoint", "mcp", "team", "skill", "plugin", "hook"]`.
  - `get_hub_nodes(top_n=10)` and `get_bridge_nodes(top_n=5)`.
  - `get_affected_flows()` for runtime / dispatch patterns.
  - `detect_changes` if there is a meaningful pre/post-brief tag.
- **Output per competitor**: feature inventory table (feature | file:line | novelty | port cost).

### Phase 4 — Cross-reference & roadmap

- Read `docs/reports/2026-05-22-competitor-review-brief.md` and `competitor-memory-systems.md` for baseline.
- For each 2026-06-04 finding, classify: `NEW` (not in 5/22 brief) / `CONFIRMED` (in brief, graph evidence now stronger) / `REJECTED` (in brief, graph does not support).
- Run `code-review-graph query_graph` against the AIOS repo: `tests_for`, `imports_of`, `callees_of` on the patterns surfaced, to find concrete AIOS gaps.
- Generate roadmap table.

## Output

Single file: `docs/reports/2026-06-04-competitor-codemap-refresh.md`.

Sections:
1. **Executive summary** — 3-5 bullet headline findings.
2. **Watchlist diff** — Phase 1 metadata table vs 2026-05-22.
3. **Phase 2 triage** — graph stats table for all clones.
4. **Phase 3 deep-dive** — feature inventory per top pick, with codemap evidence.
5. **Delta vs 2026-05-22** — NEW / CONFIRMED / REJECTED classification.
6. **AIOS gap matrix** — for each finding, what AIOS has today (via `query_graph`) and what's missing.
7. **Roadmap table** — actionable items with priority + cost + evidence.
8. **Open questions** — anything requiring user judgment before implementation.

## Output schema — roadmap table

| Field | Type | Description |
| --- | --- | --- |
| `#` | int | Sequential |
| `feature` | string | Short name (e.g., "Dry-Run Readiness Gate") |
| `source` | string | `<owner>/<repo> @ <version> (file:line)` |
| `aios_gap` | string | What AIOS lacks today (with `query_graph` evidence) |
| `user_value` | string | Why an AIOS user would care |
| `cost` | S/M/L | Small / Medium / Large effort |
| `priority` | P0/P1/P2 | P0 = blocks next release, P1 = next quarter, P2 = backlog |
| `delta` | NEW/CONFIRMED/REJECTED | vs 2026-05-22 brief |
| `evidence` | string[] | Codemap queries + file:line citations |

## Storage

- **Clones**: `temp/competitor-repos/<owner>__<name>/` (gitignored already, established convention).
- **Code graphs**: each clone builds its own `.code-review-graph/` inside the clone root; lives with the clone, no central store.
- **Report**: `docs/reports/2026-06-04-competitor-codemap-refresh.md` (tracked in git).
- **Watchlist**: read-only snapshot of `competitor-watchlist.json` (do not mutate; embed diff in report).

## Edge cases

- **Repo too large** (openclaw 373K★, hermes-agent 162K★, superpowers 202K★): use `--depth 1 --filter=blob:none` and `postprocess="minimal"`. If still too large, fall back to README + targeted file reads.
- **Private / 404 / renamed**: mark `dormant` in report, recommend watchlist removal in Open Questions.
- **Graph build failure**: log error, fall back to README + CHANGELOG only (Phase 1/2 evidence).
- **Token overflow on large graphs**: always pass `detail_level="minimal"` unless we explicitly need standard.
- **Clone dir already exists**: `git pull --depth 1` to refresh, skip rebuild of unchanged graphs (use `build_or_update_graph` incremental).
- **AIOS self-graph stale**: if `.code-review-graph/` for AIOS is older than HEAD, rebuild before Phase 4 cross-reference.

## Verification

Before claiming done:
1. `git status` shows only the new report file in `docs/reports/`.
2. All 14 watchlist competitors are mentioned in the report (table row or explicit skip note).
3. Roadmap table has `evidence` column populated for every row (no `[TBD]` placeholders).
4. Phase 2 triage table is non-empty (at least the P0 set was cloned).
5. Delta column has at least one `NEW` and one `CONFIRMED` row.
6. `ls temp/competitor-repos/` matches what the report claims was cloned.
7. `code-review-graph list_graph_stats` returns non-zero nodes for each top-pick clone.

## Risks

- **Token cost**: 14 clones × graph build is non-trivial. Mitigate with `postprocess="minimal"` in Phase 2, full only on top 5-8.
- **Disk space**: shallow clones still sizable for big repos. Mitigate with `--filter=blob:none` and clean up after report is committed.
- **Subagent availability**: this environment does not have true subagents; emulate with parallel tool calls within a single agent. Per AGENTS.md guidance, this is acceptable for independent reads.
- **Stale AIOS self-graph**: cross-reference in Phase 4 may miss recent code. Rebuild first if HEAD has changed since last build.

## What changes if approved

- No code change in AIOS repo.
- One new file: `docs/reports/2026-06-04-competitor-codemap-refresh.md`.
- `temp/competitor-repos/` populated with shallow clones.
- After report is reviewed, a follow-up `writing-plans` task can convert roadmap items into implementation plans one-by-one.

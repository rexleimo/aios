# Memo Storage Test Report

Date: 2026-05-16
Workspace: `/Users/molei/codes/aios`
Scope: `aios memo storage` abstraction with `split` and `file` implementations.

## Summary

Implemented and verified the approved user-facing model:

```text
aios memo
├── add
├── pin
├── search
├── recall
├── gui
└── storage
    ├── status
    ├── use split
    ├── use file
    ├── rebuild
    └── doctor
```

The implementation keeps SQLite/ContextDB as compatibility/cache and makes `memory/memo/` the canonical Git-friendly memo storage root. The UI/help does not expose `aios memory`, `driver`, `share`, `space`, `refresh`, or public `list` as the new model.

## Agent Team Execution

```text
Coordinator
├─ Integrated workstreams, resolved output/reporting gaps, ran final verification
├─ Worker A: storage abstraction + storage unit tests
├─ Worker B: nested CLI help + help tests
├─ Worker C: memo command integration + workspace overlay tests
├─ Opus review: independent code review, no blocking findings
└─ Test agent: read-only docs/help/test audit for requirements and multilingual wording
```

Worker results were merged with non-overlapping ownership. A follow-up review with Claude Opus reported no blocking findings. A dedicated test agent then audited README, docs-site EN/ZH/JA/KO memo pages, CLI help, and focused memo tests. It found one wording gap in changelog command syntax and recommended automated docs lint; both were fixed by spelling out `use split` / `use file` in every changelog locale and adding `scripts/tests/memo-docs.test.mjs`.

## Files Covered

- `scripts/lib/memo/storage.mjs` - storage abstraction, `file` / `split`, conversion, rebuild, doctor, status.
- `scripts/lib/memo/memo.mjs` - `memo add`, `pin`, `search`, `recall`, hidden compatibility commands, `memo storage` routing.
- `scripts/lib/cli/help.mjs` - memo and memo-storage help text.
- `scripts/aios.mjs` - nested memo help dispatch.
- `scripts/ctx-agent-core.mjs` - workspace memory overlay reads canonical memo storage first, legacy fallback second.
- `scripts/lib/specs/*.json` - bundled runtime specs replacing deleted old `memory/specs/**` runtime files.
- `scripts/lib/contextdb/skill-index.mjs` - discoverable skill index now scans repo-local `SKILL.md` roots before legacy JSON fallback.
- `scripts/package-release.sh` / `scripts/package-release.ps1` - release archives no longer require top-level `memory/`.
- `scripts/tests/memo-storage.test.mjs`, `scripts/tests/memo-cli-integration.test.mjs`, `scripts/tests/memo-help.test.mjs`, `scripts/tests/memo-docs.test.mjs`, `scripts/tests/ctx-agent-core.test.mjs` - new/focused coverage.
- `README.md`, `README-zh.md`, `docs-site/**/contextdb.md`, `docs-site/**/getting-started.md`, `docs-site/**/use-cases.md`, `docs-site/**/changelog.md` - public docs for file/split memo storage and storage boundaries.

## Verification Commands

| Command | Result |
|---|---:|
| `git diff --check` | PASS |
| `rg -n "memory/(specs|skills|knowledge)/|memory/specs|memory/skills|memory/knowledge" AGENTS.md .codex/skills .claude/skills scripts --glob '!node_modules/**'` | PASS, no stale runtime references |
| `node --test scripts/tests/memo-storage.test.mjs scripts/tests/memo-help.test.mjs scripts/tests/memo-cli-integration.test.mjs` | PASS, 25/25 |
| `node --test scripts/tests/ctx-agent-core.test.mjs --test-name-pattern "WorkspaceMemory|workspace memory"` | PASS, 32/32 |
| `node --test scripts/tests/aios-cli.test.mjs --test-name-pattern "memo|parseArgs accepts memo"` | PASS, 62/62 |
| `node --test scripts/tests/skill-index.test.mjs scripts/tests/doctor.test.mjs scripts/tests/workspace.test.mjs scripts/tests/workspace-integration.test.mjs scripts/tests/agents-sync.test.mjs scripts/tests/aios-orchestrator-agents.test.mjs scripts/tests/release-pipeline.test.mjs` | PASS after skill-source sync; release-pipeline 6/6 separately confirmed |
| `node scripts/check-skills-sync.mjs` | PASS |
| `npm run check:site-sync` | PASS |
| `node --test scripts/tests/memo-help.test.mjs scripts/tests/memo-docs.test.mjs` | PASS, 10/10 |
| `node --test scripts/tests/memo-storage.test.mjs scripts/tests/memo-help.test.mjs scripts/tests/memo-docs.test.mjs scripts/tests/memo-cli-integration.test.mjs scripts/tests/ctx-agent-core.test.mjs` | PASS, focused memo/docs/overlay coverage |
| `npm run test:scripts` | PASS, 517/517 after adding memo docs lint to the default script suite |
| `cd mcp-server && npm run typecheck && npm run test && npm run build` | PASS; mcp-server tests 81/81 |
| `rg -n 'memory/memo/stream|split\\|stream|use stream|file-stream|`stream`|aios memo use(\\s|$)|aios memo list|memo list|space list|driver|share enable|share status|share rebuild|share doctor|aios memory' docs-site README.md README-zh.md` | PASS, no stale public memo storage model references |
| `rg -n 'memory/context-db' docs-site README.md README-zh.md` | PASS, only changelog compatibility notes for legacy read paths |

## Test Agent Audit

The test agent ran a read-only audit across:

- Public docs: `README.md`, `README-zh.md`, and `docs-site/{,zh/,ja/,ko/}{contextdb,getting-started,use-cases,changelog}.md`
- Runtime/help code: `scripts/lib/cli/help.mjs`, `scripts/lib/memo/memo.mjs`, `scripts/lib/memo/storage.mjs`, `scripts/ctx-agent-core.mjs`
- Tests: `scripts/tests/memo-storage.test.mjs`, `scripts/tests/memo-cli-integration.test.mjs`, `scripts/tests/memo-help.test.mjs`, `scripts/tests/ctx-agent-core.test.mjs`

Findings:

- Main EN/ZH/JA/KO docs were already aligned on default `file`, optional `split`, canonical `memory/memo/`, ContextDB/SQLite as compatibility/cache, and `storage rebuild` not rewriting canonical memo records.
- Changelog pages used the compact expression `aios memo storage status|use|rebuild|doctor`, which did not make `use split` and `use file` explicit. This was corrected in all four locales.
- Public docs did not expose `aios memory`, `driver`, `share`, `file-stream`, `space list`, `memo list`, or `refresh` commands.
- The agent recommended an automated docs lint. `scripts/tests/memo-docs.test.mjs` now enforces forbidden public terms and exact public storage commands across localized memo docs.

## Boundary Scenarios Covered

### Storage module

- Default active storage is `file` without creating canonical files on status read.
- Storage config accepts supported names with whitespace/case normalization and rejects unsupported values such as `sqlite`.
- `file` appends JSONL memo records, supports search, and `rebuild` preserves canonical source bytes.
- `split` writes one JSON file per event and stores pinned memo markdown per space key.
- Event listing returns newest records first and respects `--limit` semantics.
- `storage use split` converts existing file records into split files.
- `storage use <invalid>` rejects unsupported storage names.
- Empty target storage imports legacy `.aios/context-db/sessions/workspace-memory--*/l2-events.jsonl` records.
- Legacy import ignores non-memo legacy events.
- `storage doctor` reports malformed file JSONL.
- `storage doctor` reports malformed split JSON files.
- `storage doctor` reports stale derived docs when source digest changes after rebuild.
- `storage rebuild` succeeds for an empty storage and writes empty derived docs plus a manifest.
- SQLite cache files are ignored as canonical memo storage.

### CLI integration

- `memo add` writes canonical file storage and mirrors legacy workspace-memory metadata.
- `memo pin set/add/show` reads and writes canonical storage, while mirroring legacy `pinned.md`.
- `memo storage use split` converts records, reports migrated records, rebuilds derived docs, and active search reads the new storage even after `.aios` is removed.
- `memo storage rebuild` does not rewrite canonical source event bytes.
- `memo storage doctor` exits non-zero on malformed active storage.
- `memo storage doctor` prints actionable stale-derived details.
- `memo recall` reads active canonical storage after legacy `.aios` state is removed.

### Help and UX

- `memo --help` exposes `storage` but hides compatibility-only `space list` and `list` from the new model.
- `memo storage --help` lists only approved storage commands: `status`, `use split`, `use file`, `rebuild`, `doctor`.
- Help tests now also reject stale public terms: `aios memory`, `driver`, `share`, `file-stream`, `refresh`, `space list`, and `memo list`.
- Nested help works for `status`, `use`, `rebuild`, and `doctor`.
- Existing parser behavior for memo passthrough args remains covered.

### Public docs

- README capability tables mention `Memo Storage` and `aios memo storage status`.
- ContextDB docs explain `file` as the default append-only JSONL storage and `split` as one JSON file per memo event.
- Getting Started and Use Cases pages show storage status and explain when to use `storage use split`.
- EN/ZH/JA/KO changelog pages document `1.17.0` memo storage with the exact public commands: `status`, `use split`, `use file`, `rebuild`, and `doctor`.
- Public docs avoid exposing hidden compatibility commands or stale `stream`/`driver`/`share` naming.

### Workspace overlay and safety

- Agent workspace memory overlay prefers canonical `memory/memo` storage when both canonical and legacy memory exist.
- Overlay warns and falls back to legacy when canonical memo storage is malformed.
- Overlay falls back to legacy workspace-memory when canonical storage is empty.
- Overlay filters unsafe pinned/memo content and reports safety notices.
- Overlay enforces max-character truncation.
- Existing memo safety/capacity tests remain green.

## Architecture Check

Canonical data paths:

```text
memory/memo/config.json
memory/memo/file/events.jsonl
memory/memo/file/pinned/<space>.md
memory/memo/split/events/<space>/<seq>.json
memory/memo/split/pinned/<space>.md
memory/memo/derived/<storage>/manifest.json
memory/memo/derived/<storage>/docs.jsonl
```

`storage rebuild` regenerates only derived query files under `memory/memo/derived/<storage>/`; it does not rewrite `file/events.jsonl` or `split/events/**/*.json`.

`storage use <split|file>` switches the active backend. If the target storage has no data, it converts from the current active backend or imports legacy workspace-memory records, then runs a full rebuild for the target backend.

Old tracked `memory/knowledge/**`, `memory/skills/**`, `memory/specs/**`, and `memory/workspace/**` files stay deleted per user approval. Runtime specs were copied to `scripts/lib/specs/`, and release archives package that location.

## Residual Risks

- No explicit cross-process lock is added for simultaneous `memo add` writes; file append and split atomic writes are safe for normal CLI usage, but heavy concurrent writers may need a future lock.
- `--semantic` remains compatibility syntax in `memo search`; this iteration focuses on storage abstraction and derived lexical query files, not embedding/vector ranking.
- Hidden compatibility commands (`memo use`, `memo space list`, `memo list`) remain available for existing workflows, but are intentionally omitted from help.
- `doctor` reports corruption/staleness but does not auto-repair canonical files; repair should stay manual unless a future command is explicitly approved.

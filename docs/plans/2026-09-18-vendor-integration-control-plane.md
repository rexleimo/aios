# Plan: Vendor integration control plane (`aios integration`)

- **Date**: 2026-09-18
- **Route**: planned / implement
- **Type**: feature (additive subsystem + CLI surface)
- **Failure class**: bounded-local (no destructive ops; external network read + reversible local config writes)

## Objective

Give AIOS one deterministic, operator-run command that installs a third-party
vendor integration (skill + docs MCP + credential *presence* check) into **every**
supported client, replacing the "paste a prompt that tells your agent to fetch a
webpage and install things" pattern.

First vendor: **TypeSafe** (`typesafe-ai`) — System One / Jev decision models.

## Problem

Today the only supported way to adopt such a vendor is the vendor's "Copy to your
agent" prompt. That is a prompt-injection-shaped supply-chain path: an untrusted
page instructs the agent, and the agent installs with full permissions. AIOS
already owns the machinery to do this deterministically but does not expose it at
the vendor layer:

- Skill fan-out exists (`installContextDbSkills` + `config/skills-sync-manifest.json`,
  `generatedRoots` maps all 9 clients) but only for the AIOS-owned catalog.
- MCP registration exists twice: CLI-delegated (`~/.aios/integrations/headroom-mcp.json`
  ledger + ownership classification, 3 clients) and config-migration
  (`components/codemap/mcp-targets`, all clients, stdio only).
- Nothing pins a *third-party* skill by commit + hash, and nothing registers a
  **remote HTTP** MCP server.

## Scope decisions

1. **Full client coverage is a hard requirement.** All 9 clients
   (`codex, claude, gemini, opencode, hermes, grok, workbuddy, pi, zcode`) get a
   declared code path. Clients whose HTTP MCP support cannot be verified on this
   machine are marked `unverified` with the exact evidence gap — never silently
   claimed as working.
2. **Declarative registry, not code branches.** Vendors live in
   `config/integrations.json`; adding a vendor must not require touching
   installer logic.
3. **Never guess.** Per-client invocations are derived from each client's own
   `--help` output and recorded with the evidence string in the client table.
4. **Pin + verify.** Skill content is pinned by commit and verified by SHA-256
   before it reaches a client root.
5. **Ownership discipline.** Reuse the Headroom ledger pattern
   (`absent | owned | external | conflict`); never overwrite a user-authored
   entry, never remove an entry whose fingerprint changed after AIOS wrote it.
6. **Credentials are checked, never stored.** `TYPESAFE_API_KEY` presence only;
   the value is never read into memory, logged, or written to a ledger.

## Tasks

### t1 — Registry + client invocation table

- Add `config/integrations.json` (schemaVersion 1) with the `typesafe` descriptor:
  homepage, `llms.txt` index, docs MCP URL + tool names, env var, pinned skill
  (`repo`, `commit`, `skillPath`, `sha256`, `installName`, `license`).
- Add `scripts/lib/integrations/registry.mjs`: load + validate (reject unpinned
  skill, non-https URL, unknown transport).
- Add `scripts/lib/integrations/clients.mjs`: 9-entry table with `buildAdd`,
  `buildRemove`, `probe`, `verified`, `evidence`.
- Acceptance: unit test asserts every id in `CLIENT_DEFINITIONS` has a table row;
  registry validation rejects a missing hash.

### t2 — Ledger + ownership

- Add `scripts/lib/integrations/ledger.mjs` writing
  `~/.aios/integrations/<vendor>.json`, with entry fingerprinting and
  `classifyOwnership({actual, desired, ledgerEntry})`.
- Acceptance: fingerprint mismatch ⇒ `conflict`; no ledger ⇒ `external`.

### t3 — Skill plane (pinned fetch + verify + catalog + fan-out)

- Add `scripts/lib/integrations/skill.mjs`: fetch the skill directory via the
  GitHub REST API (`api.github.com` trees + blobs at the pinned commit),
  verify the pinned SHA-256, stage into `~/.aios/integrations/vendor/<vendor>/`,
  then install into `<rootDir>/skill-sources/<installName>/` and delegate fan-out
  to the existing `installContextDbSkills` (covers all 9 clients by construction).
- Refuse to overwrite an unmanaged existing catalog dir.
- Acceptance: tampered hash ⇒ install fails and nothing is written to client roots.

### t4 — MCP plane (HTTP transport, all clients)

- Add `scripts/lib/integrations/mcp.mjs`: ensure/remove/inspect a **remote HTTP**
  MCP entry per client. Primary path delegates to the client's own CLI
  (`claude/codex/opencode/hermes/grok mcp add --url`); fallback path writes project
  `.mcp.json` (read by claude, hermes, and the Pi MCP adapter).
- Post-add read-back verify + fingerprint; roll back on mismatch.
- Acceptance: dry-run prints the exact invocation per client; unverified clients
  report `unverified` with a reason instead of `installed`.

### t5 — CLI surface

- `aios integration list|add|doctor|remove`.
- Wire `parse-args/integration.mjs`, `commander/specs/integration.mjs` +
  `specs/index.mjs`, `dispatch.mjs`, help text, and the top-level help examples.
- Acceptance: `aios integration doctor typesafe --json` emits a machine-readable
  report. Exit code is non-zero when a *hard gate* fails (docs MCP unreachable or
  capability mismatch, skill hash modified/absent, config conflict). A client that
  is simply not installed on this machine reports `client-missing` and does **not**
  fail the run: a user without Gemini CLI installed should not get a red doctor.
  CI that requires a specific client can assert on the `--json` `clients` array.

### t6 — Docs + discovery

- New page `integrations.md` in `docs-site/` + `zh/` + `ja/` + `ko/`, nav entry
  under "Core Features", and a cross-link from `friends.md` / footer link block.
- Acceptance: mkdocs build succeeds; page reachable at `/integrations/`.

## Verification

1. `npm run test:scripts` (root).
2. New tests: `scripts/tests/integration-registry.test.mjs`,
   `scripts/tests/integration-clients.test.mjs`, `scripts/tests/integration-mcp.test.mjs`,
   `scripts/tests/integration-skill.test.mjs`.
3. Live evidence: `aios integration add typesafe --dry-run --json` then a real
   `add` against the 6 clients installed on this machine, then
   `aios integration doctor typesafe --json`.
4. Docs: `mkdocs build` (or the repo's docs build command).

## Out of scope

- Changing `COMPONENT_NAMES` (vendor integrations are not AIOS-owned components).
- Removing the vendor's own `npx skills add` path; AIOS owns an equivalent,
  verifiable path instead.

## Status: complete (2026-09-18)

All six tasks implemented and verified. Deviations from the original design,
recorded because they change the contract:

1. **Fetch transport.** Used the GitHub REST API (trees + blobs at the pinned
   commit) instead of `codeload.github.com/<repo>/tar.gz/<commit>`. Avoids adding
   a tar dependency, and `raw.githubusercontent.com` is unreachable on this
   network while `api.github.com` responds.
2. **Tests.** Consolidated into one file, `scripts/tests/integration.test.mjs`
   (18 tests) covering registry, clients, ledger, skill plane, MCP plane, and
   doctor, rather than four separate files. Added to the `regression` list in
   `scripts/test-suites.json` so it actually runs under `npm run test:scripts`.
3. **Third transport class.** The client table has three shapes, not two:
   `cli` (CLI delegation), `config` (AIOS writes the file, e.g. Pi), and `manual`
   (file location known, HTTP transport key name unverified). `manual` clients
   report `manual-step-required` with the target file path and a JSON skeleton
   whose unknown key is left as `<transport-key>` — uniform coverage without
   fabricating a capability AIOS has not verified.
4. **Interactive clients.** Hermes prompts for the auth method and has no
   non-interactive flag, so a non-TTY run reports `pending-interactive` with the
   exact command instead of hanging or guessing.
5. **Ownership detection.** `isOwnedCatalogCopy` compares the catalog entry with
   the AIOS-injected frontmatter stripped against the pinned upstream hash, not a
   self-recorded copy hash. This survives re-runs and still detects user edits to
   the body.
6. **Extra flags.** `--skip-skills` and `--skip-mcp` let one plane be exercised
   alone.
7. **Docs discovery.** Beyond the page and nav entry: nav translations for
   zh/ja/ko, a "Model and vendor ecosystem" section in `friends.md`, and entries
   in `docs-site/llms.txt` and `docs-site/llms-full.txt` for AI answer engines.

### Evidence

- `npm run test:scripts` → `rc=0`, `files=105`, 1530 passing, 0 failing
  (`elapsed_ms=612528`).
- `aios integration add typesafe --skip-mcp` → skill installed for all nine
  clients (`installed=1` per client, no "no catalog skills matched" warnings).
- `aios integration add typesafe --skip-skills --clients ...` → registered on
  claude, codex, opencode, grok, pi; `pending-interactive` on hermes;
  `client-missing` on gemini/workbuddy/zcode.
- `aios integration doctor typesafe` → docs MCP `verified`, tools
  `search_type_safe_ai`, `query_docs_filesystem_type_safe_ai`,
  `submit_feedback`; skill `ok @65a39f393687`; `blocking=0`.

### Follow-ups not done here

- `--strict` for `doctor`: treat `client-missing` on a *verified* client as a
  blocking failure, for CI that mandates a specific client set.
- `gemini`/`workbuddy`/`zcode` HTTP transport key names: needs a machine with
  those clients installed to observe the real field name, after which the
  `manual` entries can be promoted to `config` or `cli`.

### Pre-existing issues found, not caused by this work

- `~/.codex/config.toml` contained two `[projects...]` tables that differ only in
  path letter case (line 132 `c:\\users\\...` vs line 141 `C:\\Users\\...`),
  which made `codex mcp add` fail with a TOML duplicate-key error. It cleared
  after codex rewrote its own config; no fix applied.
- `opencode.json` and `.hermes`/`.workbuddy` `.aios-native-sync.json` show
  working-copy drift from a native sync at 17:14:26, before this work's first run
  at 17:26. Left untouched.
- Any credentialed call to the TypeSafe API.

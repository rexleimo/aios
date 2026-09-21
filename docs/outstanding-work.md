# Outstanding work

> Living register. Updated whenever an item opens or closes — update it in the same commit as the change.
> Last updated: 2026-09-18, after v5.19.2.
> Source of truth for the current work item: `docs/plans/2026-09-18-triage-the-82-test-files-that-no-test-entry-reaches-23-currently.md`.

Items are split by **who owns the fix**, because that is what decides where the change lands:

- **A. This repository** — the AIOS runtime under `scripts/`.
- **B. rex-harness / MCP adapter** — the control plane contract (Fact → Capability → Evidence).
- **C. Owner actions** — not code; only you can do them.

---

## A. This repository (AIOS runtime)

### A1 — Wire the 82 test files that no test entry reaches

- **Status**: open. **Why it matters (high)**: the fixes below are green but unprotected. `evolution-integration.test.mjs` passes today because nothing runs it, not because a gate checks it.
- **Facts**: `scripts/tests/` holds 255 `*.test.mjs`. `scripts/test-suites.json` registers 111. `package.json` entries reach 173. **82 files are reachable from no entry point.** Running those 82 by hand gives 677 tests / 653 pass / 23 fail.
- **Guard already shipped**: `scripts/tests/test-suite-wiring.test.mjs` (W1 dangling refs, W2 new unwired file fails with the file named, W3 baseline drift) plus `scripts/test-wiring-snapshot.json` (82 entries, refresh with `AIOS_UPDATE_TEST_WIRING=1`). The invariant is **entry-point reachability**, not "registered in test-suites.json".
- **Next**: finish A2, then wire family by family, then shrink the snapshot by exactly the wired count (W3 fails until it is refreshed).

### A2 — The 18 remaining failures across 13 files

Counted as 23 minus the 5 fixed in v5.19.2 (derived from the triage data, not re-measured).

| Class | Files | Action |
| --- | --- | --- |
| Environment-dependent | `platform-smoke` | **RESOLVED 2026-09-21 — the triage premise was wrong.** The two real failures were static-analysis rot, not the absent python interpreter: the TLS pin anchored on the first literal `aios-install.ps1` (now the preferred local installer path — real contract: Tls12 is the first statement of the generated PowerShell script), and the tsx-dispatch pin still read `dispatch.mjs` after TUI startup moved to `dispatch/helpers.mjs`. 19/19 |
| Local state residue | `pi-shipped-content-hygiene` | **RESOLVED 2026-09-21.** The `.pi/skills` junction was removed, which exposed a masked second failure: `REPO_RELATIVE_INVOCATION` matched `scripts\` inside the absolute Windows install-root path the same test demands — Windows-only self-contradiction, third alternative now token-anchored. 7/7 |
| Stale fixture pin | `rex-v2-case-selection`, `rex-batch-invalid-training-evidence`, `rex-planning-training-evidence`, `rex-strict-tdd-training-evidence`, `rex-test-design-training-evidence` | **RESOLVED 2026-09-21 via A+C.** Re-certified all 7 involved skills (deterministic, no LLM), rewrote the 5 tests to read tracked V2 evidence through the production gate instead of the gitignored `.skillopt/` fixtures (unrunnable in CI). All 5 green, wired; `knownUnwired` 73 → 68 |
| Stale reason code | `doctor-bootstrap-task` | **RESOLVED 2026-09-21 — the implementation is the contract** (granular codes from the c85a51c3 split; runtime reads `.current-task` at startup; old code has no other consumer). Test updated to `pending-bootstrap` / `pending-stale`. 7/7 |
| Needs adjudication | `death-notice`, `hook-user-prompt`, `interception-mcp-stdio`, `automem-loop`, `ecc-agent-workflow` | **RESOLVED 2026-09-21 — all five adjudicated; in every case the test was stale.** automem-loop: auto writes land as `candidate` by explicit design (bare runtime identity); death-notice: path derives from the context-db root, not the raw workspace root; interception-mcp-stdio: payload passes through by design since 3b689cc4 (packet rides in `_meta.aios`) — red since 2026-06-11, not a regression; hook-user-prompt: north-star principle — no read-only guessing from free text, so bounded prompts are `guarded`; ecc-agent-workflow: no client is `deprecated` any more, so the compatibility-tier reason cannot fire |

### A3 — Decide what the rex training pin means (blocked 5 files)

- **Status**: **RESOLVED 2026-09-21 — owner approved A+C** ("按计划 fix 掉").
- **Verified fact**: `aios skill certify` writes only `docs/evidence/skill-training/**` and **never** touches `.skillopt/**`, while all five tests read `.skillopt/<skill>-2026-07-18/` (`gate.baselineHash`). Re-certifying alone therefore cannot turn them green by construction.
- **Why they fail**: `hash(rex-harness/skill-sources/rex-implement/SKILL.md)` no longer matches the recorded baseline, because the Skill content changed on 2026-08-02 (submodule `2c33fbd`) after the fixtures were produced on 2026-07-18.
- **Fix (A+C)**: re-certified all 7 involved skills with base=HEAD (all `accepted`; certify/evaluate is deterministic local scoring — no LLM, no network). Rewrote the 5 tests to assert, via the production `verifySkillTrainingGate`, that the current Skill content is covered by tracked V2 evidence whose `acceptedSkillHash` matches it (new shared helper `scripts/tests/fixtures/skill-training-freshness.mjs`); `rex-batch-invalid` keeps its distinctive intent hermetically — accepted evidence verifies, then a `summary.trainHard` tamper on `candidate.scored.json` (the recorded `summary_metric_mismatch` shape) is blocked by the gate.
- **Two traps found and avoided**: (1) `.skillopt/` is gitignored and zero-tracked — the old tests could never run in CI, which is the real reason they were never wired; the rewrite to tracked evidence fixes that. (2) The gate re-derives the baseline from `base` (default HEAD), so old change-certs (baseline = pre-change content, or base = a tag that no longer resolves identically) fail deep validation — certs must be produced at HEAD to be verifiable; a relative `statePath` also breaks the gate's `artifactPath` prefix check (absolute paths required).

### A4 — Small, independent

- **`work-env-py`** — **RESOLVED 2026-09-21**: the premise was wrong (see the `platform-smoke` row); no environment skip was needed.
- **`work-residue`** — **RESOLVED 2026-09-21** (see the `pi-shipped-content-hygiene` row).
- **`work-stale-code`** — **RESOLVED 2026-09-21** (see the `doctor-bootstrap-task` row).
- **`work-adjudicate`** — **RESOLVED 2026-09-21**: all five files adjudicated; the test was stale in every case (details in the table above and in the plan doc's work-item ledger).
- **`work-wire` / `work-snapshot-refresh`** — **RESOLVED 2026-09-21 for the fixed families**: 9 green files wired into the `regression` suite, `knownUnwired` 82 → 73 (exactly the wired count, guard W3 verified). **Third pass same day (A3)**: the 5 rewritten rex fixture files wired too, `knownUnwired` 73 → 68 (W3 verified). Full regression: files=129, tests=1409, pass=1401, fail=0, skipped=8 — exact +5/+5 delta over the previous baseline.
- **Release-ceremony correction (2026-09-21)**: `check-site-sync`'s `findCurrentReleaseBlogErrors` demanded a VERSION-marker blog post in en/zh/ja/ko for *every* version bump, which forced a maintenance patch into public marketing copy. Repo history shows the real convention — v5.17.0–v5.17.4 shipped changelog-only with no posts at all. The gate now exempts maintenance (patch > 0) releases; minor/major still require the post, and unknown version shapes default to requiring it.

---

## B. rex-harness / MCP adapter

### B1 — The planning evidence gate cannot be satisfied through the documented surface

- **Status**: open, unowned locally. **Why it matters (high)**: AIOS *is* a control plane; a gate that cannot be opened is not a gate.
- **Reproduction**: `aios_capability_evidence` for a planning Provider returns `delivery ticket schemaVersion must be 1` for all three of: `deliveryTicket: {}`, a well-formed `rex.delivery-ticket.v1` with `schemaVersion: 1`, and `schemaVersion: "banana"`. Identical message ⇒ **the argument is not the object being validated**.
- **Likely subject**: the plan state itself (`docs/plans/...` + `.aios/planning/active.json`), which carries `schemaVersion: 3` — a planning contract version that can never equal the ticket's `1`.
- **Where the fix lands**: not `scripts/`. The validator is absent from this repository, from `rex-harness/src`, and from `~/.aios`, so it lives in the MCP adapter/bridge that serves the tool.
- **Until fixed**: planning evidence is delivered in-band as `AIOS_REX_EVIDENCE`; do not claim the ledger recorded it.

---

## C. Owner actions (not code)

- **C1 — TypeSafe usage mystery**: the console shows Requests 0 / Tokens 0 / Spend $0.00 while real billed calls were made with a key ending `5d59`. Check the console API Keys page for that key; the likely explanation is that it belongs to a different organisation than the login in use.
- **C2 — WorkBuddy**: `codebuddy` 2.137.1 is installed, but `codebuddy mcp add` requires `--agent <name>` and the agent list has not been enumerated → still `manual-step-required`.
- **C3 — hermes**: no `mcp` subcommand; configuration only, and it needs an interactive terminal → `pending-interactive`.
- **C4 — Installed runtime is behind**: `~/.rexcil/aios` is 5.17.4. `aios judgment`, `aios_judge`, `--explicit-intent`, and everything in v5.19.2 arrive only after `aios update`.

---

## D. Closed (for reference)

- **v5.19.2** — `session:<id>` used as a file name, three root causes: `verdict.mjs` renamed onto an NTFS alternate data stream (`EINVAL`); `promotion.mjs` allow-listed the colon so the promotion was stored as a stream that `readdir` never lists and was lost with `errors.length === 0`; `integration.mjs` open-coded a second promotion writer that bypassed `promotionPath()`. Fixed in `b8d87c47`, fixture repair in `681a0487`.
- **v5.19.2** — the release fixture copied `scripts/lib/fs/atomic-write.mjs` as an explicit single file, so a new sibling import broke every preflight run *inside a temporary root only* (`681a0487`).
- **Triage** — the 23 failures across 14 unreachable files classified with a decisive probe per file (`19a9baba`).

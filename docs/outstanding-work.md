# Outstanding work

> Living register. Updated whenever an item opens or closes — update it in the same commit as the change.
> Last updated: 2026-09-21, after fixing a real `normalizeText` ReferenceError (A8) and opening A7/A9 — the `test:rl-*` suites CI never runs.
> Source of truth for the current work item: `docs/plans/2026-09-18-triage-the-82-test-files-that-no-test-entry-reaches-23-currently.md`.

Items are split by **who owns the fix**, because that is what decides where the change lands:

- **A. This repository** — the AIOS runtime under `scripts/`.
- **B. rex-harness / MCP adapter** — the control plane contract (Fact → Capability → Evidence).
- **C. Owner actions** — not code; only you can do them.

---

## A. This repository (AIOS runtime)

### A1 — Wire the 82 test files that no test entry reaches

- **Status**: **RESOLVED 2026-09-21.** All 82 wired; `knownUnwired` 82 → 73 → 68 → **0**. The last 68 were never failing — bulk probe `node --test <68 files>` gave 589 tests / 588 pass / 0 fail / 1 skipped — so they were appended to the `regression` suite in `scripts/test-suites.json` (129 → 197 files) and the snapshot refreshed to `[]` (guard W1/W2/W3 3/3). Full gate via `npm run test:affected`: 1998 tests / 1989 pass / 0 fail / 9 skipped.
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
- **`work-wire` / `work-snapshot-refresh`** — **RESOLVED 2026-09-21, fully**: all remaining 68 wired (never-failing, bulk-verified green), `knownUnwired` → 0, guard W1/W2/W3 3/3. `npm run test:affected` ran the full pool itself: 1998 tests / 1989 pass / 0 fail / 9 skipped.
- **Release-ceremony correction (2026-09-21)**: `check-site-sync`'s `findCurrentReleaseBlogErrors` demanded a VERSION-marker blog post in en/zh/ja/ko for *every* version bump, which forced a maintenance patch into public marketing copy. Repo history shows the real convention — v5.17.0–v5.17.4 shipped changelog-only with no posts at all. The gate now exempts maintenance (patch > 0) releases; minor/major still require the post, and unknown version shapes default to requiring it.

---

### A5 — OPEN: the wiring guard proves reachability, not hermeticity

- **Status**: open. **Why it matters (high)**: this gap caused the v6.0.2–v6.0.4 CI outage (see D).
- **The hole**: `scripts/tests/test-suite-wiring.test.mjs` (W1/W2/W3) proves every `*.test.mjs` is reachable from a test entry point. It cannot prove the file *passes on a clean checkout*. The A1 triage verified the 82 unwired files by bulk-running them **in a working tree where `aios init`/`sync-skills` had already generated the gitignored projection roots**, so "never failing" was measured against a developer's tree, not CI's. Every file wired that way is a latent CI failure.
- **Proposed guard (W4)**: fail when a test reads a path under a gitignored generated root (`.codex/skills`, `.claude/skills`, `.agents/skills`, `.grok/skills`, `.hermes/skills`, `.gemini/skills`, `.workbuddy/skills`, `.opencode/skills`, `.pi/skills`, `.skillopt`) instead of projecting through `materializeSkillTree` / tracked evidence. Cheapest sound version: assert the file's source text contains no such literal, then require an allow-list entry with a reason.

### A6 — OPEN: `release-health-watch` is red (pre-existing, does not block releases)

- **Status**: open, discovered 2026-09-21 while verifying the v6.0.5/v6.0.6 release. **Not caused by recent work**: the workflow has **zero successes** in all recent runs (10/10 failure, oldest examined `2026-09-19T10:45Z`) — already red before the first v6.0.2 commit — and the workflow file is unchanged since `ff387616` (2026-09-06).
- **Symptom**: job `release-health` fails at step *Run release strict health gate* with **exit code 2** (check-run annotation `.github:68`). The later step *Fail when release health is unhealthy* is **skipped**, so the job did not fail because health was judged unhealthy — the step failed by itself. `release`, `ci-main`, `docs-pages`, `windows-shell-smoke`, and `codeql` are all green, so releases are unaffected.
- **Ruled out**: the policy state path (`.aios/experiments/rl-mixed-v1/release/orchestrator-policy-release.state.json`) is gitignored via `.aios/*` and untracked, so CI takes the `else` branch — which writes a `not_configured` payload and, reproduced locally under `bash --noprofile --norc -eo pipefail`, exits **0**. `node scripts/aios.mjs release-status --strict` with a missing state file exits **1**, not 2. CRLF is present in the committed blobs of *all* workflows (including the passing `release.yml`/`ci-main.yml`), so line endings alone are not the differentiator.
- **Real defect found while diagnosing**: the step captures `gate_exit_code` but **never propagates it** (it only writes `exit_code=` to `$GITHUB_OUTPUT`), while a separate step owns the fail decision. So the observed combination — this step fails while the health-fail step is skipped — is self-contradictory, and the step cannot be trusted as a gate until that is fixed.
- **Next**: needs the run's job log (owner-only; the Actions logs endpoint returns 403 for non-admins). Either make the step explicitly propagate/exit with `gate_exit_code`, or paste the failing step's log so the exit-2 source can be identified.

### A7 — OPEN: CI never executes the five `test:rl-*` suites (41 files)

- **Status**: open, found 2026-09-21. **Why it matters (medium-high)**: it is the same blind spot as A5 one level up — the wiring guard proves a file is reachable from *a script*, never that CI *runs* that script. These 41 files have been silently red.
- **Coverage map**: `regression` (197 files) is a superset of `browser`/`context`/`client`/`orchestrator`/`harness`/`team`/`rex`, so `test:scripts` covers those. Of the 259 files on disk, 62 are outside `regression`; 21 are covered by `pretest:scripts` / `test:workflow-policy` / `test:rex-integration` (all invoked by `test:scripts`), and the remaining **41 are covered only by `test:rl-core` (13), `test:rl-shell-v1` (17), `test:rl-browser-v1` (4), `test:rl-orchestrator-v1` (4), `test:rl-mixed-v1` (3)**. No workflow invokes any of them: `ci-main` and `release` run `test:scripts`, `contextdb-quality` runs `test:contextdb`.
- **Why the guard is silent**: W2 counts a file as wired when it is in `scripts/test-suites.json` **or** matches a `scripts/tests/...` pattern in a `pretest:scripts`/`test:*` script. Those globs satisfy W2 while no CI job ever runs them.
- **Measured state**: `test:rl-core` 49/49 green; `test:rl-orchestrator-v1` 7/17 → **17/17** after A8; `test:rl-mixed-v1` 12/13 (A9); `test:rl-shell-v1` and `test:rl-browser-v1` not yet run in a clean checkout.
- **Proposed guard (W5)**: every `test:*` script must be reachable from a workflow, or be listed with an explicit reason. **Next**: run shell-v1/browser-v1, fix A9, then decide whether these belong in CI (adding them while A9 is red would break CI).

### A8 — RESOLVED 2026-09-21 (v6.0.7): `normalizeText is not defined` in shipped code

- **The bug**: `scripts/lib/rl-orchestrator-v1/decision-runner/shared.mjs` opened with `export { computeHash, normalizeText } from '../../../../src/shared/normalize.mjs'` and then **called `normalizeText` locally** (6 uses, lines 26/111/136-138). In ESM an `export … from` only forwards a binding — it does not bring the name into the module scope — so every executor-evidence path threw `ReferenceError: normalizeText is not defined`. Fixed by importing and then re-exporting (public surface unchanged).
- **Impact**: repaired **10 tests** in `test:rl-orchestrator-v1` (7/17 → 17/17). This is a genuine production defect that survived because A7 means no CI job runs that suite.
- **Checked and deliberately left alone**: `scripts/lib/harness/groupchat-runtime/shared.mjs` has the same re-export form but never uses the name locally, so it is correct as-is.
- **Verification**: `npm run test:affected` → 613 tests / 612 pass / 0 fail / 1 skipped.

### A9 — OPEN: one `rl-mixed-v1` test cannot pass as written

- **Test**: `scripts/tests/rl-mixed-v1-run-orchestrator.test.mjs` — "mixed campaign guardrails emit drift alerts and auto rollback degraded policy versions".
- **Why it fails**: it calls `runMixedCampaign({ rootDir, activeEnvironments, batchTargetCount: 3, onlineBatchSize: 4 })` with **no task source**. `sampleNextTask` finds nothing, so `collectBatchEpisodes` returns `status: 'no_work'` and `runMixedCampaign` returns `buildNoWorkResult(ctx)` — **without error and without writing anything** (probe: `experiments/` is not even created). The test then reads `checkpoints/orchestrator-bandit-policy.index.json`. It is not fixable by checkout contents either: `experiments/` is untracked (0 tracked files).
- **Evidence**: the sibling test in the same file passes because it supplies `orchestratorLiveTaskCollector`; this one supplies nothing.
- **Fix direction**: supply tasks the way the sibling does (or seed the temp root), then assert the rollback behaviour. Also worth asking whether `no_work` returning silently — no error, no artifact — is the intended contract for a caller that asked for a campaign.

---

## B. rex-harness / MCP adapter

### B1 — The planning evidence gate cannot be satisfied through the documented surface

- **Status**: **RESOLVED 2026-09-21 — the triage premise was wrong; the validator was never missing.** `normalizePlanningArtifact` lives in `rex-harness/src/domain/planning-artifact.mjs`, reached via `scripts/lib/workflows/rex-capability-runtime.mjs` ← `handleCapabilityEvidence` in `scripts/aios-mcp-server.mjs`. Proven by probe: a well-formed ticket passed directly, while the plan state (`schemaVersion: 3`) fails with the exact reported message (`delivery ticket schemaVersion must be 1`) — identical message for all three repro inputs ⇒ the serving adapter validated the plan state, never the argument. Second footgun found in-repo: the MCP schema only accepts `planningArtifact`, so a caller passing the rex-side name `deliveryTicket` had it silently dropped.
- **Fix**: `handleCapabilityEvidence` now accepts the `deliveryTicket`/`delivery_ticket` alias via exported `resolvePlanningArtifactParam` (+ regression test in `workflow-adapters.test.mjs`, 12/12). Correct call shape: pass the ticket object itself as `planningArtifact` — never wrapped, never the plan state.

---

## C. Owner actions (not code)

- **C1 — TypeSafe usage mystery (open, vendor-side; docs only cover half of it).** The console shows Requests 0 / Tokens 0 / Spend $0.00 while real billed calls were made with a key ending `5d59`. `docs-site/integrations.md` → "Configure the credential" already documents the half AIOS owns: `TYPESAFE_API_KEY` is checked for **presence only** (never read, printed, or stored), the most common failure is **scope** (a variable set in another terminal, or in the *User* scope of a different account, is invisible to an already-running client), and `aios integration doctor typesafe` reports `present`/`unset`. What the docs cannot answer is which **organisation** the key belongs to — AIOS never sees the key value or the account behind it, so a key billed under a different org than the console login is invisible to it. **Actionable**: AIOS *does* record per-judgment provenance — `model`, `x-typesafe-request-id`, and `usage.inputTokens`/`outputTokens` (see `aios judgment ask` output and `~/.aios/judgment/`) — so use a recorded successful judgment's request id as proof of the metered call and hand that id to TypeSafe support; then check the console API Keys page for the `5d59` key's organisation.
- **C2 — RESOLVED 2026-09-21 (v6.0.6, code fix — the premise was wrong).** `codebuddy` 2.137.1's `mcp add` has **no `--agent` option at all** (`codebuddy mcp add --help`: only `-s/--scope`, `-t/--transport`, `-e/--env`, `-H/--header`), and `-t` accepts `http`. Verified by running it: `codebuddy mcp add typesafe-docs <url> -t http` wrote `{"type":"http","url":...}` into an `mcpServers` namespace — exactly the key name AIOS reported as unverified. WorkBuddy moved from `manualHttpEntry` to a verified config-plane entry, so it now reports `planned`/`registered` instead of `manual-step-required`. **One divergence worth knowing**: the CLI's `-s user` scope writes to `~/.codebuddy/.mcp.json`, while AIOS owns `~/.workbuddy/mcp.json` (which `codebuddy mcp list` does read). AIOS keeps writing its own file so ledger, backup, and scoped-removal semantics stay intact.
- **C3 — hermes (open, correctly classified, exact command below).** Earlier note "no `mcp` subcommand" was wrong: `hermes mcp` exists (a TUI) and `hermes mcp add` has `--url`. The `pending-interactive` classification is nevertheless **correct and re-verified**: non-TTY runs print `Connecting to <url>` then `Does this server require authentication? [Y/n]:` and then **hang forever** (timeout 124) — including with `--auth header` supplied, because the prompt fires during connection/discovery before that flag is applied. So this stays a real manual step. **Run in a real terminal**: `hermes mcp add typesafe-docs --url https://docs.typesafe.ai/mcp` and answer the auth prompt.
- **C4 — RESOLVED 2026-09-21.** `~/.rexcil/aios` was 5.20.0 because no 6.x GitHub Release object existed (the `release` workflow was failing, see D). Once v6.0.5 published, `aios update` self-updated the installed runtime to 6.0.5; `aios --version` and `~/.rexcil/aios/VERSION` now agree.

---

## D. Closed (for reference)

- **v6.0.5 — the CI outage that blocked v6.0.2/v6.0.3/v6.0.4 releases.** `release` and `ci-main` both failed at `Run root release tests` on ubuntu while the same suite was green on Windows. Root cause: **five regression tests read gitignored generated roots**, so they could only pass in a worktree where `sync-skills` had already run. They went red in CI the moment the A1 triage wired them into the suite, which is why the first red ci-main is `8bce5864` — the last green was `0d5cea23`, and the three commits between are the wiring + v6.0.2 release.
  - `skills-no-injection-policy` → `.agents/skills/<skill>/SKILL.md`; `skills-source-tree` ×2 → `.grok/skills/...`, `.codex/skills/...`; `pi-shipped-content-hygiene` → 7 projection roots.
  - `rex-minimal-construction-training-evidence` → `.skillopt/rex-minimal-construction-2026-07-18/**` — the same dead-fixture trap A3 fixed for five sibling files but missed here. Its `gate_result.json` (`reject_train_regression`) and `state.json` (`canonicalAction: retain_baseline`) are produced by **no code in this repository**, so those two assertions tested recorded external-trainer output. Replaced with production-reachable assertions through `validateTrainingEvidence` that encode the same hazard (candidate wins validation, gives back train, and **overall looks better**).
  - `memo-events-cache` → inserted a wall-clock micro-benchmark assertion (`warm < cold`, measured 17ms vs 11ms under concurrency 4). Replaced with a best-of-N sample against a noise-tolerant budget; the deterministic `memoEventsCacheStats().hits >= repeats` check remains the hard gate.
  - Fix primitive: `scripts/tests/fixtures/skill-projection.mjs` → `readProjectedSkill()` projects through the same `materializeSkillTree` the installer/sync use.
  - **Method note (why this took so long)**: a bind-mounted Windows worktree cannot reproduce these — it carries the developer's generated roots *and* Windows binaries in `node_modules`. The failure only appears in a **pristine LF copy with container-local, platform-correct deps**. Verified: clean `node:24-bookworm-slim`, CI's exact 4 shims (`codex claude gemini opencode`), CI env → 1997 tests / 1987 pass / **0 fail** / 10 skipped.
- **v6.0.4 (CI repair)** — three genuine POSIX failures found by the same container method: `automem-loop`'s `fakeBin` wrote only a `codex.cmd` shim (unresolvable on POSIX, so the client spawn died before the memo/skip path) and `readLines` crashed on empty input with `String.map`; `team-pi-worker`'s forced-`platform: 'win32'` assertion shelled out to the real `where` binary, absent on POSIX. Classified non-failures: `package-release` needs the `zip` binary (the workflow installs it), and the two POSIX grandchild-kill tests are init-dependent (pass with `--init`).

- **v5.19.2** — `session:<id>` used as a file name, three root causes: `verdict.mjs` renamed onto an NTFS alternate data stream (`EINVAL`); `promotion.mjs` allow-listed the colon so the promotion was stored as a stream that `readdir` never lists and was lost with `errors.length === 0`; `integration.mjs` open-coded a second promotion writer that bypassed `promotionPath()`. Fixed in `b8d87c47`, fixture repair in `681a0487`.
- **v5.19.2** — the release fixture copied `scripts/lib/fs/atomic-write.mjs` as an explicit single file, so a new sibling import broke every preflight run *inside a temporary root only* (`681a0487`).
- **Triage** — the 23 failures across 14 unreachable files classified with a decisive probe per file (`19a9baba`).

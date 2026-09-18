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
| Environment-dependent | `platform-smoke` | the test must skip with a stated reason; `python3`, `python` and `py` are all absent on this host |
| Local state residue | `pi-shipped-content-hygiene` | delete the retired `.pi/skills` projection; no code change |
| Stale fixture pin | `rex-v2-case-selection`, `rex-batch-invalid-training-evidence`, `rex-planning-training-evidence`, `rex-strict-tdd-training-evidence`, `rex-test-design-training-evidence` | blocked on A3 |
| Stale reason code | `doctor-bootstrap-task` | test expects `bootstrap-without-current-task`, which exists only in the test; the implementation returns `pending-bootstrap`. Adjudicate which side is the contract |
| Needs adjudication | `death-notice`, `hook-user-prompt`, `interception-mcp-stdio`, `automem-loop`, `ecc-agent-workflow` | one adjudication per file: is the test stale or the implementation wrong |

### A3 — Decide what the rex training pin means (blocks 5 files)

- **Status**: blocked on a decision.
- **Verified fact**: `aios skill certify` writes only `docs/evidence/skill-training/**` and **never** touches `.skillopt/**`, while all five tests read `.skillopt/<skill>-2026-07-18/` (`gate.baselineHash`). Re-certifying alone therefore cannot turn them green by construction.
- **Why they fail**: `hash(rex-harness/skill-sources/rex-implement/SKILL.md)` no longer matches the recorded baseline, because the Skill content changed on 2026-08-02 (submodule `2c33fbd`) after the fixtures were produced on 2026-07-18.
- **Options**: **A+C** (re-certify the Skills, then point the tests at the latest `acceptedSkillHash` under `docs/evidence/skill-training`) or **B** (rewrite the `.skillopt` baselines to current content). Recommendation: A+C — B stamps an expired baseline as valid.

### A4 — Small, independent

- **`work-env-py`** — same as the `platform-smoke` row above.
- **`work-residue`** — same as the `pi-shipped-content-hygiene` row above.
- **`work-stale-code`** — same as the `doctor-bootstrap-task` row above.

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

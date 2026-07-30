# Context Lifecycle W0/W1 Baseline and Integration Decisions

> Date: 2026-07-28
> Repository baseline: `main` / `bfb9ce2`
> Input report: `docs/reports/2026-07-28-context-lifecycle-competitor-analysis-and-plan.md`
> Status: W0 complete; W1 complete
> Scope: baseline lock and capability integration decisions only; no product implementation

## 0. Decision summary

The next version should not be a new memory backend. It should close three existing product loops:

1. **Safe memory writes**: trusted runtime provenance, scope/ACL separation, shared publish and supersede gates, candidate promotion, and non-destructive Dream consolidation.
2. **Auditable change context**: a minimal plan-bound context contract, `Context Impact Set`, `ExecutionContextPacket`, observation receipts, stale-read/write preflight, and post-change reconciliation.
3. **Loss-aware continuation**: `full -> summary+ref -> ref-only` degradation for items with recoverable sources, plus minimal packet/receipt lineage in the existing handoff protocol.

These are three product capability groups, not a request to ship every object proposed by the competitor report as a new service. In particular:

- Do **not** create a standalone universal `ContextItem` or `ContextCard` database in this version. Project existing memo, ContextDB, offload, plan, and Rex records into a common read-time envelope; keep the minimal card fields in the existing plan/work-item contract.
- Do **not** claim validated semantic compaction, predictive anticipation, reliable asynchronous ingestion/replay, or Team shared-canonical readiness in this version.
- Do **not** add a vector database, graph database, remote memory service, or parallel handoff protocol.

W1 therefore narrows the report's broader `Context Lifecycle V1` proposal. Full validated compaction is moved to observation because the current system does not yet have complete `mustPreserve`, trust, evidence-reachability, and receipt data on which a real validator could operate.

---

## 1. Decision rules

### 1.1 Classification

| Decision | Required condition |
|---|---|
| **直接集成** | The current owner and data contract already match. Integration is additive wiring; historical state needs no semantic migration. |
| **适配后集成** | The user value is required, but current schema, trust model, enforcement point, or ownership boundary does not match. A compatibility adapter and staged rollout are mandatory. |
| **仅观察** | The signal is useful, but this version has no demonstrated product need or lacks prerequisite evidence. No new public contract or state mutation is allowed. |
| **拒绝** | The capability conflicts with local-first operation, safety, maintainability, or existing ownership, and has no evidence strong enough to justify that cost. |

### 1.2 Admission to the next version

A capability is recommended only when all of the following hold:

1. A current source path demonstrates the product gap or an existing reusable owner.
2. It closes a safety defect or the pre-edit -> mutation -> reconciliation loop.
3. It has deterministic acceptance evidence and a rollback/shadow boundary.
4. Existing commands and stored data can remain readable, except for an explicitly documented safety correction.
5. It does not require a new database or remote service.

`P0 / IN` and `P1 / IN` below are the only next-version recommendations. `P2 / OUT` and `OUT` rows are not backlog promises; each has a measurable re-entry trigger.

---

## 2. W0 — Baseline lock

### 2.1 Snapshot and verified behavior

- Source baseline: `main` at `bfb9ce2`.
- No product source was changed while completing W0/W1.
- The report's focused baseline was rerun unchanged: **69 pass / 0 fail**.
- Supplemental ownership/compatibility checks were run:
  - planning, workflow policy, and preflight: **40 pass / 0 fail**;
  - MCP ContextDB compatibility suite: **39 pass / 0 fail**.
- Total focused evidence executed for this decision record: **148 pass / 0 fail** across three independent commands.
- A one-off runtime probe reproduced the report's cross-agent supersede defect: after an `agent_private` event from Agent B superseded Agent A's `project_shared` event, Agent A's live query returned `visibleToAgentA=[]`.

### 2.2 Frozen capability inventory

The word "frozen" means the behavior is a compatibility baseline. It does not freeze known unsafe behavior.

| Baseline capability | Current owner and source evidence | Compatibility lock | Known gap that is **not** protected behavior |
|---|---|---|---|
| Local-first state roots and legacy ContextDB fallback | `scripts/lib/aios/state-root.mjs:25-47,86-104`; `mcp-server/src/contextdb/paths.ts:20-49` | Continue to honor `AIOS_PROJECT_STATE_DIR`, `.aios/**`, and read fallback from `memory/context-db/**`. No remote dependency. | `scripts/lib/harness/solo-runtime/dry-run-readiness.mjs:36-57,90-102` and `scripts/lib/session/changed-files.mjs:14-20` still hard-code `.aios`; those paths must be normalized before enforcement. |
| Append-only memo events, temporal supersede, as-of history | `scripts/lib/memo/storage/events-write.mjs:40-65,115-143`; `temporal.mjs:37-79`; `query.mjs:56-83` | Existing file/split stores, v1 rows, `--as-of`, and `--include-invalid` remain readable. Existing memo commands remain. | Unauthorized supersede links must no longer affect another visibility/authority domain. Safety correction may change which legacy cross-scope links are honored. |
| Existing memo scope values and role-local memory | `normalizers.mjs:44-53`; `query.mjs:34-53`; `harness/subagent-runtime/role-memory.mjs:17-31,33-97` | Keep `project_shared`, `agent_private`, and `agent_ephemeral` as accepted values; keep current agent-private reads. | Scope is not an ACL. Agent identity and publication authority are not trustworthy enough for shared canonical writes. |
| Recoverable local tool-output refs | `scripts/lib/offload/tool-offload.mjs:42-88`; offload file/split ref store; canvas tests | Preserve `node_id`, raw output ref, file/split storage, current capture thresholds, and hook/CLI behavior. | Canvas compaction writes `ref: ''` (`mermaid-canvas.mjs:284-300`), so a compacted summary is not itself traceable. |
| ContextDB canonical session files, rebuildable sidecar, session context packet | `mcp-server/src/contextdb/core.ts:62-168,1633-1767`; `mcp-server/src/contextdb/paths.ts`; current 39-test suite | Preserve canonical files, rebuildable SQLite sidecar, `buildContextPacket()` Markdown semantics, context CLI flags, legacy malformed-row tolerance, and genealogy behavior. | The existing `ContextPacket` is a session-oriented Markdown pack, not a mutation contract. It must not be silently redefined as `ExecutionContextPacket`. |
| Context pack source/content hashes | `scripts/lib/contextdb/pack-manifest.mjs:43-76` | Keep current manifest format readable and reuse SHA-256/ref primitives. | There is no turn-level aggregate receipt explaining included, degraded, or excluded context. |
| Continuity and handoff | `scripts/lib/contextdb/continuity.mjs:121-177`; `contextdb/handoff.mjs:56-108,124-179`; `harness/handoff.mjs:13-41` | Continuity v1, ContextDB handoff v2, and existing harness payloads remain readable. No third handoff protocol. | Handoff has no base/context revision, source hash, verification refs, or stale check. The two current shapes need adapters, not another canonical shape. |
| Plan v2, Rex work-item/evidence contracts, workflow routing | `scripts/lib/planning/schema.mjs:175-238`; `planning/contract.mjs:219-305`; `harness/orchestrator/work-items.mjs:103-123,171-220`; `rex-harness/src/domain/commands.mjs:2-16`; `rex-harness/src/application/validate-command-evidence.mjs:61-85` | Plan v1/v2 remains readable; direct/guarded/planned decisions and Rex current-Command/evidence ownership remain unchanged. Rex remains independent and does not become a ContextDB implementation. | Plan tasks lack declared targets, required context, interfaces, content baselines, and revision. Rex evidence says what proves a stage, not what context authorizes a write. |
| Ready/warning/blocked preflight and ownership hints | `scripts/lib/lifecycle/preflight-contracts.mjs:57-64,161-228`; `planning/workflow-policy.mjs:414-435` | Reuse verdict shape, `ownedPathPrefixes`, and `requiresPreEditSafety`; direct/read-only routes must not acquire mandatory planning. | `requiresPreEditSafety` is currently only a decision field. It is not wired to a common mutation admission point. |
| Changed-files ledger | `scripts/lib/session/changed-files.mjs:26-74`; harness handoff merge ownership checks | Reuse path/change-type rows and existing public report output. | Ledger coverage is not complete enough to be the only authority, particularly for shell mutations; reconciliation needs a Git-diff fallback. |
| Candidate/manual review pattern | `scripts/lib/harness/learn-eval/recommendations/hindsight-drafts.mjs:180-188,216-231` | Reuse candidate -> manual review -> explicit apply semantics where automatic promotion would be unsafe. | Session close bypasses this pattern and writes assistant-derived text directly to shared durable memory. |
| Dream preview/apply command surface | `scripts/lib/lifecycle/dream/index.mjs:112-210`; `dream/dedup.mjs:106-197` | Preserve command discovery and preview information. | Physical deletion and owner-insensitive shared dedup are unsafe and are not compatibility promises. `apply` may intentionally become logical archive/tombstone rather than delete. |

### 2.3 Canonical ownership lock

| Concern | Canonical owner for the next-version work | Reused adapters | Ownership that is explicitly rejected |
|---|---|---|---|
| Memo event authority, temporal rules, publication/supersede policy | `scripts/lib/memo/storage/**` | ContextDB may project memo rows into a read-time context envelope. | ContextDB must not reimplement memo supersede or publish policy. |
| Session context data, `ExecutionContextPacket`, and `ContextReceipt` persistence | `mcp-server/src/contextdb/**` through a stable CLI/JS boundary | `scripts/lib/contextdb-cli.mjs`; `scripts/lib/contextdb/**` facade/projection helpers | `scripts/lib/harness/subagent-runtime/context-packet.mjs` is not a canonical store; it remains a thin adapter. |
| Objective, acceptance, targets, allowed writes, verification declaration | `scripts/lib/planning/**` plan/work-item contract | Rex `workItemKey`, current Command, and evidence refs are linked, not copied. | ContextDB must not choose Rex capabilities or own plan progression. |
| Write admission and reconciliation verdict | `scripts/lib/lifecycle/preflight-contracts.mjs` plus the common mutation admission layer | workflow-policy `requiresPreEditSafety`, ownership hints, changed-files ledger, Git diff | Prompt text is never the enforcement point. |
| Raw offload content and representation refs | `scripts/lib/offload/**` | ContextDB assembler consumes refs and hashes. | Receipt/assembler must not duplicate raw tool output. |
| Handoff lineage | Existing ContextDB handoff evolves additively; harness handoff is an adapter | `scripts/lib/contextdb/handoff.mjs`, `scripts/lib/harness/handoff.mjs` | No parallel "context handoff" protocol. |

### 2.4 W0 completion verdict

**PASS.** Every P0/P1 proposal below names an existing owner or a narrowly scoped new module under an existing owner. No proposal assumes a vector store, graph store, remote service, or big-bang data migration.

---

## 3. Evidence index used by W1

### 3.1 Current-source evidence

- **C1 — memo authority and defect surface**: `scripts/lib/memo/storage/events-write.mjs:40-65,115-143`; `query.mjs:34-53`; `temporal.mjs:37-79`; `normalizers.mjs:44-53`.
- **C2 — automated promotion and destructive consolidation**: `scripts/lib/lifecycle/session-hooks/close.mjs:64-90`; `lifecycle/dream/index.mjs:112-210`; `dream/dedup.mjs:106-197`.
- **C3 — ContextDB packets, hashes, continuity, handoff**: `mcp-server/src/contextdb/core.ts:625-908,1633-1767`; `scripts/lib/contextdb/pack-manifest.mjs:43-76`; `continuity.mjs:121-177`; `handoff.mjs:56-108`.
- **C4 — offload and budget behavior**: `scripts/lib/offload/tool-offload.mjs:42-88`; `offload/mermaid-canvas.mjs:272-307`; `search/budget.mjs:28-58`; `contextdb/facade.mjs:9-54`.
- **C5 — plan and preflight seams**: `scripts/lib/planning/schema.mjs:175-238`; `workflow-policy.mjs:414-435`; `lifecycle/preflight-contracts.mjs:57-64,161-228`; `harness/solo-runtime/dry-run-readiness.mjs:27-124`.
- **C6 — work items, changed files, handoff merge**: `scripts/lib/harness/orchestrator/work-items.mjs:103-123,171-220`; `session/changed-files.mjs:26-74`; `harness/orchestrator/handoffs.mjs:19-86`.
- **C7 — Rex evidence/receipt primitives**: `rex-harness/src/domain/commands.mjs:2-16`; `domain/execution-receipts.mjs:51-72`; `application/validate-command-evidence.mjs:61-85`; `standalone/store.mjs:95-152,194-227`.
- **C8 — reviewed-candidate pattern**: `scripts/lib/harness/learn-eval/recommendations/hindsight-drafts.mjs:180-188,216-231`.

### 3.2 External-source evidence from the 2026-07-28 refresh

- **X1 — temporal provenance, not a graph-store requirement**: `getzep/graphiti:graphiti_core/edges.py:263-282` keeps episode refs, valid/invalid time, expiration, and reference time together.
- **X2 — observed-read citations**: `letta-ai/letta-code:docs/examples/mods/memory-citations.ts:162-196,242-318` records actual memory-path reads and forbids invented citations.
- **X3 — scope isolation and non-silent budget degradation**: `volcengine/OpenViking:bot/vikingbot/openviking_mount/ov_server.py:404-416`; `bot/vikingbot/config/schema.py:631-633`.
- **X4 — recoverable offload and budget telemetry**: `TencentCloud/TencentDB-Agent-Memory:src/offload/l3-helpers.ts:222-229`; `src/core/hooks/auto-recall.ts:708-771`; `src/offload/hooks/after-tool-call.ts:254-305`.
- **X5 — automatic session capture as both value and warning**: `mem0ai/mem0:integrations/mem0-plugin/scripts/capture_session_summary.py:158-190` retains source/session/run/expiration but still promotes assistant-derived content automatically.
- **X6 — proposal provenance, stale hash, explicit apply, rollback**: `openclaw/openclaw:src/skills/workshop/types.ts:12-14,17-22,69-114,135-149`; `service.ts:418-423,532-624,677-689`.
- **RPT — synthesized report**: `docs/reports/2026-07-28-context-lifecycle-competitor-analysis-and-plan.md`, especially sections 3.2-3.3, 4.1-4.7, 5.1-5.4, and 8.

For every `P0 / IN` or `P1 / IN` row, the matrix cites at least one current-source item (`C*`) and one refreshed external item (`X*`), in addition to the report synthesis.

---

## 4. W1 — Integration decision matrix

### 4.1 Direct integration and adapted integration — recommended scope

| ID | Capability | Decision / release | User value | Current baseline + external evidence | Owner, reuse, and compatibility strategy | Migration risk / effort | Required acceptance evidence |
|---|---|---|---|---|---|---|---|
| **A1** | Trusted runtime provenance envelope | **适配后集成** — `P0 / IN` | Stops agent-generated claims from appearing as user-authored facts; makes every shared candidate attributable and auditable. | C1 has session/turn fields but memo writes fix `role: user`; C3/C7 provide hashes, session IDs, activation and receipt refs. X1 and X6 show source/time/origin fields on the object being governed. | ContextDB owns the envelope contract; orchestrator/runtime injects `principalId`, `agentId`, `runId`, delegation/model/policy data; memo/handoff are writers. Old rows are projected as `legacy_unknown`, remain readable, and are not rewritten. `role` remains conversational role; publication authority moves to provenance/policy. | **High / M** — every client and hook must use a trusted injection seam. | New `memo-provenance.test.mjs`: spoofed body/CLI identity cannot override runtime identity; 100% of new shared candidates contain producer, claim status, source ref/hash, policy version, and revision. Existing memo/handoff tests remain green. |
| **A2** | Scope/ACL separation plus shared publish and supersede gate | **适配后集成** — `P0 / IN` | Fixes the reproduced path where Agent B's private memo hides Agent A's shared fact; prevents invisible cross-agent writes. | C1 proves temporal fold currently runs before identity filtering and accepts arbitrary `supersedes`. X3 demonstrates namespace isolation; X6 demonstrates status, origin, target hash, and stale gating below prompt text. | Memo storage remains owner. Keep current scope strings and reads, add independent read/write/publish/supersede policy. Human/manual CLI may receive publisher authority; agent writes default to candidate. Legacy same-scope links remain readable; unauthorized private->shared links are ignored/denied and emit immutable DENY receipts. | **High / M** — intentional correction can resurrect a shared fact hidden by a legacy unauthorized link. | New `memo-supersede-acl.test.mjs`: private->shared, private->other-private, and unprivileged shared->canonical all deny; authorized shared update requires target revision/hash; cross-agent leak/hide/delete count `0`; DENY receipt completeness `100%`. Preserve as-of/include-invalid behavior. |
| **A3** | Session-close candidate gate and explicit promotion | **适配后集成** — `P0 / IN` | Retains useful automatic capture without turning the last assistant answer into organization truth. | C2 shows direct `project_shared` write; C8 already has candidate/manual-review semantics. X5 preserves useful lifecycle metadata but exposes the same automatic-promotion risk; X6 supplies proposal states. | `session-hooks/close.mjs` writes a candidate with provenance/evidence refs; explicit human/steward promote calls memo publication policy. Keep the session-close command and exit behavior; return an additive `candidateId/status/promoted=false` shape instead of claiming a shared memo was written. | **Medium / S-M** — scripts parsing the old confirmation text may need an intentional safety migration note. | New `session-close-candidate.test.mjs`: no assistant-derived close record appears in active shared recall before promotion; explicit authorized promotion succeeds; rejected/expired candidate remains traceable; touched-file refs survive. |
| **A4** | Dream proposal -> logical archive/tombstone -> retention GC | **适配后集成** — `P0 / IN` | Prevents owner-insensitive dedup and irreversible loss while retaining preview/consolidation value. | C2 shows shared dedup by space and physical JSONL rewrite/unlink. X6 provides pending/stale/applied states, current-content hash checks, and rollback material. | Dream/memo lifecycle remains owner. Preserve preview output. `apply` records proposal decisions and append-only archive/supersede tombstones; it returns `removedCount: 0` until a separate retention-qualified GC. Winner selection must include scope, owner, trust, work item, and source hash. | **High / M** — intentionally changes destructive `apply` semantics; old automation must be documented. | New `dream-proposal.test.mjs`: no pre-retention unlink/rewrite; keep/drop IDs and input/output hashes recorded; stale source hash blocks apply; restore path works; cross-owner automatic dedup count `0`. Existing preview tests remain green. |
| **D1** | Existing source hash, offload ref, and Rex receipt primitives | **直接集成** — `P1 / IN` enabler | Gives packets and receipts verifiable pointers without copying raw outputs or inventing a new evidence scheme. | C3 already computes source/content SHA-256; C4 stores `node_id` and raw refs; C7 validates protocol-prefixed `receipt:` refs. X2 records observed reads; X4 keeps `node_id + summary + result_ref`. | Original modules retain ownership. ContextDB receipt/packet stores only typed refs and hashes. No old state rewrite and no new raw-output store. Missing/dangling refs are reported, never synthesized. | **Low / S** | Existing offload and ContextDB tests stay green; new `context-source-ref.test.mjs` resolves every emitted typed ref, rejects placeholders/dangling refs, and verifies hash mismatch detection. |
| **A5** | Observation-only `ContextReceipt` | **适配后集成** — `P1 / IN` | Answers what context was included, degraded, excluded, and why; creates the data needed before stronger automation. | C3/C4 expose hashes, token/drop counts, refs, but no aggregate decision receipt. C7 has execution receipts with a different owner/purpose. X2 validates observed-use recording; X3/X4 show link-only degradation and budget telemetry. | New canonical receipt module under ContextDB. The assembler emits append-only/sidecar receipts with `included`, `degraded`, `excluded`, budget, reason, policy version, and source-manifest hash. Rex execution receipts are referenced, not merged into the schema. First release is observation-only and cannot alter ranking. | **Medium / M** — reason-code stability and sensitive excluded-item redaction require care. | New `context-receipt.test.mjs`: every considered item appears exactly once in included/degraded/excluded; all degraded items have a resolvable ref; scope-denied details do not leak content; same inputs/policy produce deterministic reason codes; disabling receipt writing leaves current output unchanged. |
| **A6** | Minimal plan-bound context contract, Context Impact Set, and `ExecutionContextPacket` | **适配后集成** — `P1 / IN` | Ensures edits consider target interfaces, related tests, project rules, current failures, and verification instead of relying on prompt length. | C5/C6 provide objective, acceptance, work items, ownership hints, and evidence, but not targets/required reads/hashes. C3's existing `buildContextPacket()` is session Markdown. X6 proves target-content hash and proposal revision are practical local guards. | Planning v3 owns optional `contextRevision`, targets, allowed writes, required refs/reasons, interfaces, and verification declarations. ContextDB materializes the canonical `ExecutionContextPacket`. Keep `buildContextPacket()` and its CLI unchanged; add a distinctly named API/file. `subagent-runtime/context-packet.mjs` stays thin. No standalone ContextCard store: the plan/work-item is the card source for this version. | **Medium-High / M-L** — name collision and plan migration are the main risks. | New `execution-context-packet.test.mjs`: old plan v1/v2 and session packets remain readable; every required item has `reason`, ref, base/expected hash, and verification coverage; current MCP ContextDB 39-test suite remains green; direct/read-only work creates no mandatory packet. |
| **A7** | Stale-read/write preflight and selective mutation admission | **适配后集成** — `P1 / IN` | Stops a planned/high-risk edit when required context changed after it was read, while avoiding process overhead for read-only/direct work. | C5 already has ready/warning/blocked and `requiresPreEditSafety`, but no common admission. C6 has ownership hints and changed files. X6 marks proposals stale when target hashes change. | Lifecycle preflight/admission owns enforcement. Reuse verdict shape and workflow-policy bit. Fix all state-root hard-coding first. Maintain `baseHash` plus session-updated `expectedHash`. Start shadow-only; then fail closed only for planned/high-risk writes through covered write/edit/patch/rename/delete paths. Uncovered shell mutation keeps Team/shared-canonical disabled. | **High / M-L** — false positives and client/tool coverage can block legitimate edits. | New `preedit-context-admission.test.mjs`: required coverage and fresh coverage `100%`; external change blocks; the same session's authorized second write passes via `expectedHash`; undeclared target blocks; custom `AIOS_PROJECT_STATE_DIR` works; direct/read-only remains unchanged. Coverage report must list every mutation path and the shell gap. |
| **D2** | Existing changed-files ledger as post-change reconciliation input | **直接集成** — `P1 / IN` | Detects actual-vs-declared drift and closes the edit loop without a new mutation log format. | C6 already emits normalized path/change-type rows and ownership checks. X6 compares current target content to captured hashes before apply. | Lifecycle reconciliation consumes the ledger unchanged and supplements it with Git diff/status because shell coverage is incomplete. Normalize the ledger's state-root path but retain row schema and public output. Emit a receipt; do not auto-revert user changes. | **Medium / S-M** — missing instrumentation must not create a false pass. | New `post-change-reconciliation.test.mjs`: writes outside targets/allowed prefixes produce drift; ledger and Git disagreement chooses the conservative superset; user/pre-existing dirty files are identified rather than reverted; no-change and declared-change cases pass. |
| **A8** | `full -> summary+ref -> ref-only` budget degradation | **适配后集成** — `P1 / IN` | Prevents budget pressure from silently erasing the existence of relevant evidence. | C4's memo budget stops at the limit and canvas summary has an empty ref; C3's packet compressor counts drops but does not leave per-item refs. X3 specifies link-only fallback; X4 retains summary and raw-result ref. | ContextDB assembler chooses representation; offload remains raw-ref owner. Apply degradation only when a valid recoverable ref exists. Items without refs are kept/truncated according to policy or explicitly excluded in the receipt; never fabricate a ref. Initial shadow mode leaves current ranking/output unchanged. | **Medium / M** — not all legacy events have recoverable refs. | New `context-budget-representation.test.mjs`: no considered recoverable item disappears without a receipt/ref; representation and reason are deterministic; dangling ref count `0`; hard constraints/acceptance/verification are never degraded below policy; existing packet/budget tests remain green. |
| **A9** | Minimal revisioned handoff lineage | **适配后集成** — `P1 / IN`, lineage only | Lets solo resume and existing handoff consumers prove which packet, receipt, and verification state they received. | C3 has ContextDB handoff v2; C6 has a separate harness payload and file-level merge checks. X6 provides version/hash/stale state and rollback lineage. | Add optional `baseRevision`, `contextRevision`, `packetRef`, `receiptRef`, and `verificationRefs` to the existing canonical ContextDB handoff via a backward reader/adapter. Harness v1 maps to/from it. Do not add semantic conflict resolution or enable shared-canonical Team writes. | **Medium / M** — current normalizers discard unknown fields and must deliberately support v2/v3. | New `handoff-lineage-compat.test.mjs`: v2 round-trip/render unchanged; v3 lineage refs resolve; stale base revision warns/blocks according to route; harness v1 adapter loses no existing field; no private ref is promoted to shared visibility. |

### 4.2 Observation only — explicitly not recommended for this version

| ID | Capability | Decision / release | Value and why it is out | Current/external evidence and reuse if revisited | Risk / effort | Re-entry trigger and future acceptance evidence |
|---|---|---|---|---|---|---|
| **O1** | General reliable ingestion queue, cursor, checkpoint, and replay framework | **仅观察** — `P2 / OUT` | Valuable once asynchronous extractors exist, but the recommended version only changes existing synchronous local writers. Building a general queue now would expand state and failure modes without a measured loss/duplicate problem. Targeted write atomicity/idempotency defects may still be fixed under A1/A2. | ContextDB already deduplicates events and rebuilds its SQLite sidecar; memo append sequencing is simpler and lacks a general operation cursor. RPT 4.7 summarizes Tencent/OpenViking durable-ingestion signals. | **High / L** | Re-enter only after receipts show real duplicate/loss/replay failures or an async extractor is approved. Then require crash-at-every-boundary replay tests, stable operation IDs, cursor/write atomicity, and zero duplicate shared publication. |
| **O2** | Full validated semantic compaction | **仅观察** — `P2 / OUT` | Current source can compress and count, but cannot prove preservation of constraints, evidence, fact/assumption boundaries, or scope because those fields are incomplete. A8 fixes silent loss; it does not claim semantic validation. | C3 has deterministic token-containment fallback; C4 has canvas/memo truncation. X4 supplies token metrics; RPT 5.3 defines the stronger contract. | **High / L** | Re-enter after A5 receipts cover enough real long tasks and plan/context fields mark must-preserve data. Require 100% must-preserve/evidence/acceptance/verification reachability, zero scope expansion, and conservative fallback on failure. |
| **O3** | Predictive anticipation or learned prefetch | **仅观察** — `P2 / OUT` | The version needs deterministic impact resolution, not an opaque predictor. There is no local hit-rate or avoided-read dataset yet. | A6/A5 will generate actual-needed vs included/degraded receipt data. The paper's reported predictor results were not independently reproduced (RPT 2). | **High / L** | Re-enter only after a statistically useful receipt corpus exists and offline replay shows better task success or lower latency/tokens with no scope leak. Predictor output must remain advisory and independently verifiable. |
| **O4** | Team shared-canonical enablement and semantic multi-agent handoff merge | **仅观察 / NO-GO** — `P2 / OUT` | A9 lineage is useful for solo resume, but full Team publication/semantic merge is unsafe while identity, ACL, concurrent append, shell coverage, and ACL-stickiness gates are incomplete. | C1/C2 show current blockers; X3/X6 show isolation and proposal/stale patterns. | **Very High / L** | Re-enter only when all security/concurrency gates pass: cross-agent hide/leak/delete `0`, unauthorized publish `0`, concurrent append loss/duplicate `0`, ACL expansion `0`, stale write bypass `0`, and handoff revalidation `100%`. |

### 4.3 Rejected capabilities

| ID | Capability | Decision | Why rejected now | Existing module to keep | Reconsideration evidence required |
|---|---|---|---|---|---|
| **R1** | Graph retrieval or a graph database as the Context Lifecycle core | **拒绝 / OUT** | Graphiti's useful lesson is temporal provenance (X1), not the storage dependency. Current local lexical/token retrieval, refs, sidecar indexes, and genealogy graph are sufficient for the next-version impact resolver. | `mcp-server/src/contextdb/core.ts`, `semantic.ts`, `genealogy.ts`; memo temporal storage. | A reproducible impact-recall benchmark must show that deterministic import/text/CRG fallback cannot meet required-context coverage and that a graph materially improves task success after operational cost is included. |
| **R2** | New vector database, remote memory service, or polyglot memory backend | **拒绝 / OUT** | Violates the local-first scope and solves no demonstrated W0 gap; adds migration, privacy, availability, and packaging risk. | JSONL/split canonical stores, rebuildable SQLite sidecar, token-overlap semantic option. | Only reconsider for a separately approved scale requirement with local fallback, privacy review, migration/rollback proof, and benchmarked benefit. |
| **R3** | LLM-generated per-agent memory architecture, automatic verified promotion, or fuzzy-score-only compaction acceptance | **拒绝 / OUT** | Non-deterministic policy generation and automatic promotion undermine provenance and auditability. A fuzzy score cannot replace hash/ref/scope gates. | Explicit plan/policy schemas, reviewed-candidate pattern, deterministic validators. | Requires an independently reproducible safety/effectiveness result and deterministic hard gates; absent that, do not reopen. |
| **R4** | Big-bang migration to a universal ContextItem store or a parallel handoff/context-packet protocol | **拒绝 / OUT** | Duplicates current owners, forces historical rewrites, and risks breaking public data/commands. The next version needs adapters and projections, not a second truth source. | Memo temporal store, ContextDB session store, plan v2, existing handoff, offload refs, Rex evidence journal. | Reconsider only if an existing owner is proven unable to serve at least planning, solo runtime, and handoff through an additive contract. |

---

## 5. Strict next-version scope fence

### 5.1 Recommended default

Only the following three user-visible capability groups are in scope:

| Group | Included matrix rows | User-visible outcome |
|---|---|---|
| **G1. Safe memory writes** | A1-A4 | Shared memory can no longer be silently authored, replaced, or physically deleted by an unauthorized/private agent path. Automatic capture becomes reviewable. |
| **G2. Auditable edit context** | D1, A5-A7, D2 | Planned/high-risk edits can show required context, read freshness, write authorization, actual drift, and the evidence used. Rollout starts in shadow mode. |
| **G3. Loss-aware continuation** | A8-A9 | Budget pressure and handoff preserve recoverable refs and lineage instead of silently dropping context or inventing confidence. |

Implementation primitives in these rows are not separate product features. For example, `ContextReceipt` is evidence for G2/G3, and the minimal plan-bound context fields are support for `ExecutionContextPacket`; neither justifies a new independent database or UI by itself.

### 5.2 Explicitly out of scope

- General durable ingestion/replay service.
- Full semantic compaction validator or paper-reported quality score.
- Predictive anticipation/prefetch.
- Graph/vector/remote memory backend.
- Team shared-canonical writes or semantic conflict merge.
- LLM-generated memory schemas or automatic fact promotion.
- Big-bang migration of existing memo, continuity, handoff, plan, ContextDB, or offload data.

---

## 6. Compatibility and migration contract

| Existing data/API | Next-version treatment | Rollback boundary |
|---|---|---|
| Memo event v1, file/split stores | Read in place; project into legacy provenance/trust defaults. New writes may use additive fields. Unauthorized legacy cross-scope supersede links stop governing other principals. | Disable new projection/receipt consumers; canonical rows are not rewritten. Safety denial is not rolled back for Team/shared publication. |
| Plan v1/v2 and Markdown artifacts | Existing in-memory v1->v2 path remains; missing context fields receive defaults. Persist v3 only on an explicit plan write/update. | Old readers ignore optional sidecar/new fields; original plan artifact remains. |
| ContextDB `buildContextPacket()` and context CLI | Unchanged. Add separately named `ExecutionContextPacket` API/artifact. | Remove/ignore execution packet sidecars; session packet behavior remains. |
| Continuity v1 and handoff v2/harness v1 | Continue reading/rendering; add optional lineage through a versioned adapter. | Omit new optional fields; no old handoff rewrite. |
| Offload refs and canvases | Keep raw refs and storage. Receipts point to them. New compaction must not emit empty/fake refs. | Ignore receipt representation decisions; raw refs remain canonical. |
| Dream preview/apply | Preview remains. `apply` becomes logical, auditable state transition; physical GC requires retention and separate authorization. | Tombstone/archive operations have restore pointers; no source deletion before retention. |
| ContextReceipt and ExecutionContextPacket | New sidecars, observation-only first. They never become the only copy of source content. | Stop emitting/reading sidecars without corrupting old state. |

### Intentional safety changes

Two behaviors are allowed to change despite compatibility pressure:

1. A private or unauthorized event no longer invalidates a shared/canonical fact for another principal.
2. Dream `apply` no longer physically deletes source evidence before retention-qualified GC.

Both changes require release notes and migration tests, but preserving the old behavior would preserve a security/data-loss defect.

---

## 7. Migration risk register

| Risk | Why it matters | Mitigation / gate |
|---|---|---|
| Trusted identity is unavailable on one client/hook | Provenance becomes user-controlled again. | That writer can create only local candidate/observed records; shared publish is fail-closed. Client coverage is an acceptance artifact. |
| `ContextPacket` name collision | Existing MCP packet consumers could be broken by a new mutation schema. | Keep `buildContextPacket()` unchanged; use the explicit `ExecutionContextPacket` name and separate artifact kind. |
| Legacy shared rows lack trust/provenance | Treating all old data as canonical would preserve unsafe assumptions; hiding it would break recall. | Keep it readable as `legacy_unknown`; exclude from new hard constraints unless explicitly promoted/verified. |
| State-root hard-coding | Shadow/preflight can report false ready/blocked under custom state directories. | Normalize dry-run and changed-files paths through `resolveAiosStateRoot/resolveContextDbRoot` before packet enforcement. |
| Shell/write instrumentation gap | Admission or reconciliation could claim coverage it does not have. | Use conservative Git-diff reconciliation, publish a coverage report, and keep Team/shared-canonical disabled until the gap is closed. |
| Existing dirty worktree | Automated rollback/reconciliation could overwrite user changes. | Reconciliation reports ownership/drift only; it never reverts. Track base/expected hashes and distinguish pre-existing paths. |
| Receipt leaks denied context | An excluded-row receipt could reveal private content. | Store opaque ref/reason only for denied items; verify zero denied-text leakage. |
| Handoff v2/v1 adapters lose fields | Resume or Team behavior could regress. | Bidirectional golden fixtures; v2 render unchanged; unknown optional fields preserved where possible. |
| Memo concurrent append | Sequence collisions can undermine provenance and Team safety. | Do not enable Team shared-canonical writes. Add targeted atomicity/idempotency tests before changing that gate; do not build O1 without evidence. |

---

## 8. Acceptance evidence

### 8.1 Verified W0 commands

```text
node --test \
  scripts/tests/memo-temporal.test.mjs \
  scripts/tests/memo-scope.test.mjs \
  scripts/tests/contextdb-continuity.test.mjs \
  scripts/tests/contextdb-facade.test.mjs \
  scripts/tests/handoff.test.mjs \
  scripts/tests/canvas-context-scaling.test.mjs \
  scripts/tests/offload-tool-offload.test.mjs

Result: 69 pass / 0 fail
```

```text
node --test \
  scripts/tests/workflow-policy.test.mjs \
  scripts/tests/planning-contract.test.mjs \
  scripts/tests/preflight-contracts.test.mjs

Result: 40 pass / 0 fail
```

```text
npm --prefix mcp-server run test:contextdb

Result: 39 pass / 0 fail
```

### 8.2 Required release evidence for the recommended rows

A release candidate is not accepted by a design document or unit count alone. It must produce:

1. **Compatibility evidence**
   - The 148 focused W0 checks remain green.
   - Old memo v1, plan v1/v2, continuity v1, handoff v2/harness v1, offload refs, and session context packets have golden read/round-trip fixtures.
   - No existing public command disappears; intentional safety-output changes are documented.

2. **Safety evidence**
   - Cross-agent private/shared hide, leak, supersede, or delete: `0`.
   - Unauthorized shared/canonical publish or promotion: `0`.
   - New shared candidate provenance completeness: `100%`.
   - Dream physical deletion before retention: `0`.
   - Derived ACL/visibility expansion: `0`.

3. **Mutation-context evidence**
   - `required_context_coverage = 100%` for enforced planned/high-risk mutations.
   - `fresh_context_coverage = 100%` at admission.
   - Undeclared covered write targets are blocked; post-change drift is always receipted.
   - Same-session authorized successive edits are not falsely blocked.
   - Direct/read-only workflow behavior remains unchanged.

4. **Receipt/budget evidence**
   - Every considered item has exactly one included/degraded/excluded decision.
   - Every degraded item has a resolvable ref; dangling/fabricated refs: `0`.
   - Scope-denied receipt text leakage: `0`.
   - Acceptance criteria and verification command loss: `0`.

5. **Rollout evidence**
   - Receipt and packet observation can be disabled without touching canonical source data.
   - Shadow-mode false-positive and missing-coverage rates are reported before selective enforcement.
   - Team/shared-canonical remains NO-GO until O4's re-entry gate is met.

### 8.3 Decision completeness check

- Every P0/P1 row names current modules, an external source, one canonical owner, compatibility behavior, migration risk, effort, and acceptance evidence.
- Direct integration is limited to primitives whose contracts already match (D1, D2); all policy/schema changes are classified as adapted integration.
- Every uncertain or prerequisite-dependent feature is observation-only.
- Every rejected feature has a measurable reconsideration condition rather than an open-ended promise.

---

## 9. W0/W1 completion

- **W0: complete** — baseline, ownership, compatibility locks, known unsafe exceptions, and verified tests are recorded.
- **W1: complete** — all required candidate capabilities have one of the four decisions and an explicit next-version boundary.
- **Next dependency step**: W2 competitor portfolio can proceed independently. W3 may use only the `P0 / IN` and `P1 / IN` rows above; it must not pull O/R rows into the release to solve architecture uncertainty.

# VFC runtime capability preservation

Date: 2026-10-30
Work item: `vfc-runtime-capability-fix`
Type: behavior-fix. Failure class: premature-stop / context-starvation.

## Scope contract

Goal: preserve a worker's ability to inspect authorized evidence and complete its assigned task while retaining write ownership, transcript restrictions and the handoff schema. Input: structured plan/job/phase, delivered execution context, upstream handoffs, agent card. Output: runtime prompts that permit discovery before reporting an evidence gap and reserve JSON for the final handoff.

Non-goals: changing model/reasoning/token budgets, resuming parent sessions, expanding filesystem permissions, removing schema validation, claiming measured model-quality improvements, or changing global workflow policy. Live model calls are not necessary for the deterministic instruction correction; no new quota-spending automation.

Targets / allowed writes: foundation agents brief and shared emitter, subagent and groupchat prompt owners, GroupChat run boundary, routing reference, their existing tests, this plan and ADR 0004. Generated repo-local agent cards may be refreshed through the existing sync owner. No installed-runtime or user-profile writes.

## Findings and decision

- Brief and agent card ordered blocked when a fact was absent from the brief, despite tool access and delivered context. Change to search authorized sources before blocked, and use general reasoning without inventing task facts.
- Runtime no-op and verification prohibitions were conditioned on code edits, suppressing review/diagnostic tasks. Condition completion on the assigned objective and acceptance instead.
- Ownership is checked against filesTouched; clarify it bounds edits, while other access restrictions still apply to reads.
- Runtime output contracts were copied rather than using the shared owner. Reuse its renderer, replace a card's existing output section, and apply JSON-only to the final reply after tool work.
- GroupChat replaced the whole executable prompt and model routing with a lossy compact packet when no executionContext was supplied. Preserve executable inputs for all turns while continuing redacted compression observation and post-receive storage. Subagent already preserves its executable prompt.
- A self-contained brief does not isolate a forked host session. Absence of a nonce in output is a leakage smoke check, not proof that context was inaccessible.

Tradeoff: workers may do more relevant inspection before stopping. Keep investigation tied to objective/acceptance and require a concrete missing item when blocked. Keep actual edit policy unchanged. Rejected: removing contracts, injecting full transcripts, or adding broad new policy layers.

## Acceptance and test mapping

1. Rendered brief and card explicitly allow authorized discovery before blocked and do not claim missing brief facts are inherently unavailable. Existing dispatch-brief and handoff-contract tests observe emitted text.
2. Actual team runtime preserves task, delivered context, upstream handoffs and work items; no-op is not inferred from lack of edits, and reviewers may run relevant checks. Existing runtime capture test and focused prompt builder scenarios observe delivered prompts.
3. ownedPathPrefixes remains an edit boundary; read-only phases still cannot report modifications. Existing runtime file-policy tests remain unchanged.
4. Shared final output contract is present exactly once, preserves all schema constraints, and permits intermediate tool use. Exercise real card renderer plus runtime system builders.
5. GroupChat real runGroupChat -> spawnFn boundary preserves a unique middle task condition and original model routing for large prompts, while metrics retain compact pre/post records. Existing groupchat boundary test changes its model-input expectation deliberately: losing task context is the behavior being corrected.
6. Documentation delivery gate, generated cards and routing reference agree. Run existing sync/delivery suites.

Public test seams: renderDispatchBriefMarkdown, renderManagedAgentContent, buildSystemPrompt/buildUserPrompt, buildSystemPromptForSpeaker/buildRolePrompt; runtime.execute capture for the full prompt path. Test source artifacts as product output, not prose heuristics for judging model behavior.

## Execution graph and verification

T1 audit -> T2 failing prompt-contract tests -> T3 bounded owner changes -> T4 focused tests and complete regression -> T5 evidence/report.

Commands: focused subagent-context/native-delivery/agents-sync and prompt runtime capture; npm run test:affected; npm run test:regression; syntax and directory standards checks. Full regression may serve as affected's fallback but must be reported with exact command/result. No live-model quality uplift claimed without controlled task comparisons.

## Evidence

Audit: clean main/origin/main; git pull --ff-only reported Already up to date. CRG get_impact_radius unavailable in configured MCP; direct import/caller search used. Codemap search returned no matches. Pre-edit safety gate and engineering standards loaded. New objective has its own Rex work item; stale AIOS auto-gate plan was not adopted.

- RED: `node --test scripts/tests/foundation/subagent-context/dispatch-brief.test.mjs` exited 1 (6 pass / 5 fail); receipt `8fb4ce77-5c0f-49ba-83cb-0549dfdd8404`. GroupChat large-input boundary also failed before the correction (receipt `1445b2ac-c7b8-47bc-85ad-a7e2f35cb8ec`).
- GREEN: same brief command exited 0, 11/11; receipt `97f77354-6952-4c0c-995d-73a86cc8be85`. GroupChat 38/38. Combined context/native delivery/agents-sync: 66 tests, 63 pass / 0 fail / 3 opt-in live tests skipped.
- Refactor review: no new abstraction or changed schema/permissions. Two runtime copies now use the existing shared final contract. Test changes deliberately replace prompt-as-summary expectations with complete task delivery, keep redacted logs and post-receive compression checks, and preserve file-policy assertions. A unique middle condition is checked both in executable prompt and CLI routing command. Redundant assertion and surplus blank lines removed to keep both large legacy test files within their shrink-only baselines. `node --test scripts/tests/execution/harness/team/groupchat-runtime.test.mjs scripts/tests/foundation/subagent-context/dispatch-brief.test.mjs`: 49 pass / 0 fail.
- Generated cards: existing sync owner updated 19 roles each for claude/codex/opencode/grok (76 local ignored artifacts). No user-profile writes.
- Deterministic packet-loss probe (no model call): a 4,706-character task prompt contained `Reject duplicate invoice IDs even when amounts differ.`; the 1,897-character compact packet had a raw ref but did not contain that condition. This establishes loss of a concrete task condition in the old replacement path, not a measured change in reasoning quality.
- Shared contract size: context 264 -> 389 characters, output 691 -> 820 (+254 characters combined); these are character counts, not measured tokens. GroupChat retains full input, so actual model input may increase; compact observer metrics do not establish model-input savings.
- `node scripts/check-syntax.mjs`: checked=1300 failures=0.
- `node scripts/aios-standards.mjs --root . --rule directoryEntries`: blocking=0.
- `node scripts/aios-standards.mjs --root . --rule fileLines`: blocking=7, all unchanged stock; the touched legacy tests remain within their previous 4220/846-line baselines. No budget/config changes.
- Touched document citations: 28 refs in 3 files / 0 invalid. Whole repository retains 335 pre-existing invalid refs, no increase.
- Installed `aios doctor`: exit 0 / verify complete, effective_warn=66 (including existing browser/codemap/projection attachment diagnostics). This is an environment report, not a clean-environment claim.
- A direct focused runtime attempt hit its 50-second shell budget after its prompt-capture assertion passed; broader suites provide the authoritative runtime/file-policy result. No retries or longer test assertions were added.

## Standards review

Fixed point: `dc3436c746ee1ca660450ecb4c6340a09ae7018f` (the clean HEAD captured before this task). No commit was requested: the reviewed object is the non-empty working-tree diff against that fixed point, not an empty HEAD-to-HEAD commit range. Diff saved locally as `.aios/artifacts/vfc-runtime-review.diff`.

AGENTS.md + engineering standards: ownership stays in existing foundation renderers and execution boundaries; imports point from runtime to foundation. No schema, permission or budget changes; generated client files use the existing sync owner. Changed production files are below the soft line budget; touched legacy tests do not grow beyond baselines. All 12 smells checked: Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest — none newly introduced. Shared output contract reuse removes copies and the two obsolete GroupChat helpers are deleted. Standards findings: 0 in this diff; 7 pre-existing line-budget blockers remain outside it.

## Spec review

Source: this scope contract and acceptance mapping. Complete task facts remain in normal subagent prompts, delivered context and upstream handoffs; GroupChat now retains full input and routing. Blank brief facts prompt authorized discovery before blocked; write policy is unchanged. No-code review/verification may complete without edits. Final JSON contract retains the schema constraints and source output sections are replaced once. Default prohibition now addresses reliance on implicit parent history, rather than pretending a worker can prevent its host from forking. No transcript injection, permission broadening, model/budget changes or claimed A/B quality uplift. Spec findings: 0 in the bounded diff. Static review pass does not replace the full regression and targeted follow-up results recorded below.

## Validation status

The initial affected run failed with ENOSPC in D:/Temp, including artifact/session fixture writes. The first full run on the same full volume was interrupted rather than treated as valid evidence. Only this session's aborted sandbox (birthtime matched the run) was disposed. Full regression restarted using C:/Users/Administrator/AppData/Local/Temp (81 GB available) with TMPDIR/TEMP/TMP redirected; no user temporary files were deleted. Final focused suite after the default-rule consistency fix: 104 tests / 101 pass / 0 fail / 3 opt-in skips.

## Final verification evidence

- Full regression: `node scripts/run-test-suite.mjs regression` (same runner as `npm run test:regression`), with TMPDIR/TEMP/TMP set to C:/Users/Administrator/AppData/Local/Temp: 259 files, 2,494 tests / 2,481 pass / 1 fail / 12 skip, elapsed 612,811 ms. The only failure was native-agent-guidance's obsolete literal `self-contained brief (objective, owned paths, refs)`; its subsequent fallback assertion also still called the brief an isolation boundary. All runtime assertions passed, including actual prompt capture, out-of-ownership writes, read-only merge roles, model routing and runtime context redaction.
- Corrected only that reference-document assertion to require write ownership + acceptance, authorized discovery before blocked, and explicitly no context-isolation claim; added dependency-read assertion. No production changes followed the full run. This is a test-contract alignment to the previously confirmed scope, not a relaxed runtime assertion.
- Final focused validation: `node --test scripts/tests/foundation/native/native-agent-guidance.test.mjs scripts/tests/foundation/native/native-partial-delivery.test.mjs scripts/tests/foundation/subagent-context/*.test.mjs scripts/tests/execution/team/agents-sync.test.mjs scripts/tests/execution/harness/team/groupchat-runtime.test.mjs`: **113 tests / 110 pass / 0 fail / 3 opt-in live skips**. This reruns the sole failing file and all prompt/delivery/GroupChat changes. The full 259-file suite was not repeated after the test-only correction; do not describe the prior full run as zero-failure.
- Rex work item completed after standards/spec review (command=null, missingEvidence=[]). Final test-only alignment reviewed against the same scope. Repository-local cards remain 76/76 current, with 19/19 runtime roles emitting one output contract and no legacy field table.

Evidence durability: the raw logs, review diff and verdict envelope referenced above live under `.aios/artifacts/` (gitignored), so they are verifiable on this machine only. The durable, re-runnable paths are the committed tests and the exact commands recorded here.

Version Impact: patch for this fix in isolation. Recommended Version: no change in this uncommitted task; aggregate next release already includes unpublished minor behavior. Why: correct existing task delivery and premature stopping. Release Notes: preserve authorized discovery, final handoff contract and GroupChat executable task input. Installed AIOS runtime was not updated; repository source and regenerated repo-local cards are the delivered scope.

# rex.standards-spec-review.v1

Fixed-point: `HEAD` `b4e02c92` vs working tree.
Diff: `git diff HEAD` plus the review-fix sources/tests.
Spec: `docs/plans/2026-08-14-review-fixes-test-design.md`.

## Standards

Smell baseline checked. No hard AGENTS.md style violations.

- Duplicated `readOptionalClientJson` extracted to `emitters/shared.mjs`.
- Resume/recall phrases live in `resume-phrases.mjs`.
- Dead WAL (`commitStateTransaction` / `listRecordsUnlocked`) removed from `rex-activation-store.mjs`.
- `XAI_API_KEY` is no longer a Grok client signal.

Judgement remaining, out of this slice: live `.codex/hooks.json` still needs native sync (non-goal).

Result: 0 hard / 0 in-scope judgement.

## Spec

| ID | Status |
|---|---|
| P1 CCRG query | `turn-recall.mjs` queries `.code-review-graph/graph.db` or injected `queryCcrg`; output is `ccrg: queried|unavailable|skipped` |
| P2 ledger reuse | `startStored` returns the existing active workflow for the same work-item key |
| P3a/b fail-closed | `executePhaseJob` blocks before `runOneShot` when prefixes are missing or bind is not `ok` |
| P4 hooks | source commands include `--client`; CLI honors it; API key is not identity |

GREEN receipt `receipt:cb31a329-4fcd-4c33-aa9a-62f351d12beb` (exit 0).

Verdict: pass for the review-fix slice.

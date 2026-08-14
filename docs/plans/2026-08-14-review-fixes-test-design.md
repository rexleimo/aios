# Test design: rex-code-review fixes (S1–S4, P1–P4)

## Goal
Make the uncommitted workflow/ledger/hook/recall/isolation slice match the review verdict.

## Non-goals
- Migrate `.aios/workflow-activations`
- Change direct/guarded/planned
- Live Codex/Grok `/hooks-trust` or native sync of this checkout
- Call MCP `get_minimal_context` from a hook (hooks have no MCP). Local `.code-review-graph/graph.db` query is the CLI equivalent.

## In-scope behaviors

| ID | Observable behavior | Public seam | Assertion |
|---|---|---|---|
| P1 | planned/resume recall runs a real CCRG graph query | `collectTurnRecall` | text includes `ccrg: queried` or `ccrg: unavailable`; never “Call get_minimal_context”. Injectable query is invoked. |
| P2 | same work-item key + already-active workflow is reused | `startStoredAiosCapabilityActivation` | second start with a different capabilityId returns the first activationId; work-item index still points at the first workflow |
| P3a | editable job does not launch when rex bind fails | `executePhaseJob` | `runOneShot` not called; run status blocked with rex-bind reason |
| P3b | editable job does not launch without ownedPathPrefixes | `executePhaseJob` | blocked before `runOneShot` |
| P4 | hook sources name `--client`; API key is not Grok identity | hook JSON + `detectHookClient` + `aios plan hook-user-prompt` | commands contain `--client codex/grok`; `XAI_API_KEY` alone ≠ grok; CLI `--client grok` is honored and planned turns attach recall |
| S1 | one optional JSON reader | emitters | Codex/Grok import shared helper (covered by existing emitter/doctor tests remaining green) |
| S2 | one phrase table | resume/recall keywords | existing extra-phrase tests stay green after extract |
| S3 | no dead WAL writer | activation store | persist failure still leaves previous command; no `commitStateTransaction` |

## Out of scope
- Child-process write interception
- Full `npm run test:scripts` as the only gate (focused files first)

## Allowed seams
- `scripts/tests/turn-recall.test.mjs`
- `scripts/tests/rex-activation-store.test.mjs`
- `scripts/tests/work-item-rex-isolation.test.mjs`
- `scripts/tests/hook-user-prompt.test.mjs`
- `scripts/tests/native-agent-guidance.test.mjs`
- `scripts/tests/harness-runtime/phase-execution.mjs`

## Done when
Focused tests above pass and each P1–P4 row has a failing-then-passing public assertion.

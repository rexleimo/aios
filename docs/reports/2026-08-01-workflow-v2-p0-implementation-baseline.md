# Workflow Iteration v2 P0 implementation baseline

> Date: 2026-08-01
>
> Scope: typed Requirements Decision, ambiguity routing, and Rex/standalone/AIOS/CLI round-trip.
>
> This report records fresh verification for the current worktree. It does not include `agent-sources/skills/` as a project modification.

## Worktree boundary

- Existing parent and `rex-harness` modifications were retained.
- `agent-sources/skills/` remains untouched.
- No commit or version bump was made.
- `git diff --check` and `git -C rex-harness diff --check` returned no errors; Git only emitted its normal LF/CRLF warning.

## Implementation artifacts

- `rex-harness/src/domain/requirements-decision.mjs`
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/application/evaluate-request.mjs`
- `rex-harness/src/workflows/software-workflow-runtime.mjs`
- `rex-harness/src/standalone/store.mjs`
- `rex-harness/src/cli/evidence.mjs`
- `rex-harness/src/application/advance-activation.mjs`
- `rex-harness/src/capabilities/requirements/capability.mjs`
- `scripts/lib/workflows/rex-harness-adapter.mjs`
- `scripts/lib/workflows/rex-activation-store.mjs`
- `scripts/lib/workflows/rex-capability-runtime.mjs`
- `scripts/lib/planning/cli.mjs`
- `scripts/lib/cli/parse-args/plan.mjs`
- `scripts/aios-mcp-server.mjs`

## Tests and receipts

| Area | Result | Evidence |
|---|---:|---|
| Rex full test | 157/157 | `receipt:c3951c04-2077-4b21-86c4-36be41178f6c` (direct Node wrapper over all `tests/**/*.test.mjs`) |
| Rex contract + doctor | 35/35 | fresh `npm run test:contract && npm run doctor` |
| Parent Rex integration | 32/32 | fresh `npm run test:rex-integration` |
| Workflow policy | 71/71 | fresh `npm run test:workflow-policy` |
| Projection/provider/training | 14/14 | focused parent command |
| Ambiguity corpus | 31/31 | `receipt:5f6408b9-1f0c-4fef-b30f-114646af9559` |
| Parent workflow/runtime focused | 35/35 at the final focused run | `receipt:0758490a-667d-476f-9e98-501462d88f10` |
| npm package dry-run | passed | `npm pack --dry-run` from `rex-harness` cwd |

The first attempt to create a Rex receipt for `npm --prefix rex-harness test` failed because the receipt runner uses direct `spawnSync` and cannot resolve Windows `npm`/`npm.cmd` in that boundary (`ENOENT`/`EINVAL`). This is an execution-environment limitation, not a test result; the same canonical npm command was run directly and passed. The direct parent focused receipt and corpus receipt remain valid.

## Closed-loop behavior verified

```text
vague Chinese/English request
  -> requirements.clarify
  -> requirements-decision.v1
  -> Evidence Envelope / standalone CLI / MCP
  -> activation store and workflow state
  -> decision Observation becomes authoritative Fact input
  -> test-design or strict-TDD route
```

Security/compatibility cases covered:

- old workflow request JSON without `requirementsDecision` round-trips unchanged;
- old Command expected evidence remains resumable;
- current activation and command token are required;
- decision is accepted only at Requirements clarify stage;
- decisionRef must match `requirements-decision-recorded` evidence;
- unknown Evidence Envelope fields fail closed;
- `--requirements-file` rejects traversal and external symlink/realpath targets;
- weak vague wording does not override structured decision Observations;
- user-modified projection targets, junctions, forged markers, staging races, and recovery boundaries remain covered by the projection suite.

## Remaining gate

Only the independent read-only Standards/Spec review remains before P0 can be marked closed. Any Critical/Important finding must receive a targeted fix and fresh re-verification; no new feature scope is opened by that review.

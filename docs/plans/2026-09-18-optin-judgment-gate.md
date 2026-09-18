# Plan: Opt-in judgment gate (Jev as a workflow gate, default off)

- **Date**: 2026-09-18
- **Route**: planned / implement
- **Type**: feature (opt-in capability + explicit enablement surface)
- **Failure class**: bounded-local (config writes) + **external metered calls** (gated behind an explicit user enable action)
- **Predecessor**: `docs/plans/2026-09-18-vendor-integration-control-plane.md` — which shipped the
  *install* plane and deliberately left **"Any credentialed call to the TypeSafe API"** out of scope.

## Objective

Let an AIOS workflow **consult a System One judgment** (Jev) at declared decision points —
**only after the user has explicitly enabled it**, and never as an authority.

The capability is a **gate that can only narrow action**, never widen it. It is the
runtime counterpart to the existing contract in `AGENTS.md`:

> the model declares judgments and confidence; the runtime only validates shape and thresholds.

## Why this shape (and not "add an MCP tool that calls Jev")

Measured facts on this machine, 2026-09-18:

| Fact | Evidence |
| --- | --- |
| The registered `typesafe-docs` MCP is **docs-only** | 4 tools: `search_type_safe_ai`, `query_docs_filesystem_type_safe_ai`, `submit_feedback`, `read_typesafe`. No inference tool. |
| The installed `typesafe-ai` skill carries **no call recipe** | `grep TYPESAFE_API_KEY\|POST\|curl\|systemone` → **0 hits** |
| AIOS has **no runtime call point** | repo-wide matches: `config/integrations.json` + docs pages only |

So "install the integration" cannot ever produce a Jev call. The missing piece is a
**call-side capability**, not another registration.

A Jev judgment is a **proposal with a confidence**, not a fact. Wiring it as a
generator would put an unverified external model inside the decision path. Wiring it
as a **gate** matches how the repo already works: `pre-edit-safety-gate`,
`verification-before-completion`, and rex stage advances are all gates.

## Enablement contract (default off)

Three independent conditions must hold before any byte leaves the machine:

| # | Condition | Surface | Default |
| --- | --- | --- | --- |
| 1 | Credential present | `TYPESAFE_API_KEY` (presence checked, value never read into logs) | absent |
| 2 | Explicit enable flag | `~/.aios/judgment/config.json` → `{"typesafe":{"enabled":true}}`, written by `aios judgment enable typesafe` | `false` |
| 3 | Per-call budget intact | `maxCallsPerSession` + `maxInputChars` in the same config | conservative |

Failure of any condition ⇒ **the call surface does not exist** (fail closed):

- the MCP tool is not registered while disabled;
- the CLI refuses with `judgment-disabled` and the exact enable command;
- no code path falls back to "assume the answer is yes".

Precedent for opt-in-by-explicit-action in this repo: `AIOS_AUTODREAM_AUTO=1`.

## Architecture

```
TYPESAFE_API_KEY (env, presence only)  ─┐
aios judgment enable typesafe          ─┼─►  ~/.aios/judgment/config.json
                                          │     { enabled, model, floors, budget }
                                          ▼
                          ┌───────────────────────────────┐
                          │ trigger surfaces (only when   │
                          │ enabled=true)                 │
                          ├───────────────────────────────┤
                          │ 1. MCP  aios_judge            │  aios-bridge
                          │ 2. rex  judgment gate         │  rex-harness stage advance
                          │ 3. CLI  aios judgment ask     │  human / scripts
                          └───────────────┬───────────────┘
                                          ▼
                    scripts/lib/judgment/jev-client.mjs   ← the ONLY egress
                    refuse when disabled · budget · timeouts · 429/529 backoff
                                          ▼
                          POST https://api.typesafe.ai/v1/systemone
                                          ▼
                    { answers{type,value,confidence?,probabilities?}, usage, requestId }
                                          ▼
                    shape validation + risk-scaled threshold (runtime does only this)
                                          ▼
                    verdict: act | confirm | abort   ← proposal, carries confidence
```

### Hard rules

1. **One egress.** `jev-client.mjs` is the only module that may perform the HTTP call.
   Everything else goes through it, so enabling/disabling and budgeting have one owner.
2. **Shape before value.** The runtime validates the response against the question types
   it sent. An answer whose `type` does not match its question is an error, never coerced.
3. **Confidence gates, risk scales.** Floors come from config, not from the model:
   `act` requires `confidence >= actFloor`; below `confirmFloor` ⇒ `abort`. Destructive
   actions carry a higher floor than read-only ones.
4. **Never a fact.** A judgment may be recorded only as
   `judgment{question, answer, confidence, model, requestId}` with provenance. It must
   never be written into ContextDB, a memo, or a graph edge as a fact.
5. **Never widen.** A verdict can only block or downgrade an action. No verdict may
   authorize something a gate would otherwise refuse.
6. **Auditable spend.** Every call records `requestId` + `usage` + the caller's
   surface, so a metered call is always attributable (this matters: the console for
   this key shows zero requests, so local evidence is currently the only evidence).

## Trigger points (v1)

| # | Point | Question | Verdict use |
| --- | --- | --- | --- |
| 1 | Risk triage before a write batch | `severity: score` over an ordered rubric | selects `strict-tdd` vs `tdd`; `abort` ⇒ ask the human |
| 2 | Provider advance after an implement turn | `evidence_present: noul` + `criteria.true/false` | below floor ⇒ do not advance the rex stage |

Point #3 (intent routing: `choice: [plan, guarded, direct]`) is **deliberately excluded
from v1**: `AGENTS.md` requires an explicit `intent` declaration and forbids inferring it
from text. A model supplying intent would be that inference. It can be revisited as a
*human-facing draft* (propose the question, let the human answer), never as an authority.

## Tasks

### t1 — Config + CLI (enablement)
- `scripts/lib/judgment/config.mjs`: load/save `~/.aios/judgment/config.json`, validate
  floors (`0 <= confirmFloor < actFloor <= 1`), budget, model alias.
- `aios judgment status | enable <vendor> | disable <vendor> | ask`.
- `enable` verifies credential **presence** and prints the exact next step; it never
  reads or echoes the value.
- Acceptance: with no config file, `status` reports `disabled` and `ask` refuses.

### t2 — Client (single egress)
- `scripts/lib/judgment/jev-client.mjs`: build request from declared questions, POST with
  bearer auth, 10s timeout, backoff on 429/529, typed errors (401/422/429/529/network).
- Response shape validation against sent question types; return
  `{ok, answers, usage, requestId, model}` or `{ok:false, reason, requestId?}`.
- Budget enforcement (calls/session, input chars) **before** the request.
- Acceptance: disabled ⇒ no socket is opened (assert via an injected transport).

### t3 — Verdict mapping
- `scripts/lib/judgment/verdict.mjs`: `answers` + floors + risk class ⇒ `act | confirm | abort`
  with the reason string. Pure function, no I/O.
- Acceptance: a `confidence` just below `actFloor` yields `confirm`; below `confirmFloor`
  yields `abort`; a mismatched answer `type` yields an error.

### t4 — Trigger surface 1: MCP `aios_judge`
- Register in the `aios-bridge` surface **only when enabled**; absent otherwise.
- Input: `{state, questions}`. Output includes `verdict`, `confidence`, `model`,
  `requestId`, `usage` so the caller can cite evidence.
- Acceptance: with `enabled:false` the tool is not in the tool list.

### t5 — Trigger surface 2: rex stage gate
- A Provider may request a judgment at a declared stage-advance point; the gate can only
  return `advance | hold`. `hold` is a normal outcome with a printed reason, not a crash.
- Acceptance: an injected low-confidence answer holds the advance and prints the reason.

### t6 — Docs (4 locales) + discovery
- Extend `docs-site/integrations.md` (+`zh`/`ja`/`ko`): credential setup for Windows /
  macOS / Linux, **scope choice (User vs Machine)**, and **"restart your client"**, plus
  the enable command and the default-off statement.
- `site-text-integrity` compares non-en locales line-by-line against `zh` ⇒ all four move together.
- Acceptance: `mkdocs build` succeeds; page reachable at `/integrations/`.

## Verification

1. `npm run test:scripts` (full regression, green on the exact release tree).
2. New suite `scripts/tests/judgment.test.mjs` added to the `regression` list in
   `scripts/test-suites.json` (otherwise it does not run — see the predecessor's deviation 2).
3. **Disabled-path proof**: with no config and no enable flag, assert zero network calls
   and an actionable refusal message.
4. **Live proof (owner-approved, metered)**: one `aios judgment ask` after enabling,
   recording `requestId` + `usage` as evidence.
5. Docs build + a line-parity check across the four locales.

## Out of scope

- Making any judgment authoritative, or letting it write a fact into memory/graph.
- Intent inference from prose (see trigger point #3 exclusion).
- Auto-enabling: no `aios` command may turn this on without the user naming it.
- Resolving the open console/account mismatch for the existing key — that is a vendor-side
  investigation; the request-id evidence recorded here is what makes it actionable.

## Open questions

1. Should `enable` perform a **shape probe** (a real 1-question call, metered) or stay
   offline and leave proof to `aios judgment ask`? Default: offline; require `--probe`.
2. Do the trigger points belong in the rex **submodule** or in the host workflow layer?
   The gate is host policy; rex should only *ask*. Default: host-side gate, rex unchanged.

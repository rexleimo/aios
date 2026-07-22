# Proportional Workflow Optimization Roadmap

## Objective

Reduce ordinary coding-client startup context while preserving one evidence-driven AIOS/rex-harness workflow across Codex, Claude Code, Gemini, OpenCode, Hermes, and Grok.

The canonical structure is:

```text
client-neutral workflow core
  |-- AGENTS.md  -> Codex, OpenCode, Hermes, Grok
  |-- CLAUDE.md  -> Claude Code
  `-- GEMINI.md  -> Gemini
```

All projections carry the same workflow invariants. A client overlay may describe only verified native capabilities; it cannot change workflow semantics or claim unsupported prompt hooks, agents, team execution, or live orchestration.

## Dependency Graph

```text
P1 compact six-client native guidance
  -> P2 deterministic skill resolution
      -> P3 structured Rex change and risk facts
          -> P4 proportional capability and evidence gates
              -> P5 Rex API, outcome, and dependency hardening
                  -> P6 revisioned crash-consistent persistence
                      -> P7 AIOS adapter and diagnostic convergence
                          -> P8 six-client smoke and staged rollout
```

P1 is the only implementation batch authorized by the current request. Later phases may refine interfaces discovered by earlier phases, but must not be pulled into P1 merely because they are adjacent.

## Work Items and Verification

### P1 - Compact six-client native guidance

- Input: current native source partials, client capability registry, emitters, and native-sync tests.
- Change: keep workflow, safety, privacy, and verification invariants always loaded; move ContextDB, CRG, browser, team, harness, model-routing, interception-history, and client-manual details behind discoverable on-demand routes.
- Completion: the shared AGENTS projection is deterministic for Codex, OpenCode, Hermes, and Grok; Claude and Gemini use native files with capability-safe overlays; no non-Codex client manual is appended to Codex context.
- Verification: focused guidance and native-sync tests, workflow-policy tests, Rex integration tests, full script suite, client/agent doctor output, and measured entrypoint size reduction of at least 60% with an approximate 1,500-2,000 token ordinary-entrypoint budget.
- Rollback: revert the composer/source batch and regenerate managed instruction blocks from the previous sources.

### P2 - Deterministic skill resolution

- Input: the P1 projection contract and all discoverable skill roots.
- Change: define precedence, provenance, duplicate-name handling, and actionable conflict diagnostics.
- Completion: the same installed roots resolve the same Provider skill independent of client and enumeration order.
- Verification: resolver unit tests, duplicate/conflict fixtures, and six-client discovery smoke.
- Rollback: retain the current registry path behind a compatibility switch until deterministic resolution passes smoke.

### P3 - Structured Rex change and risk facts

- Input: stable skill resolution plus current Observation and Fact schemas.
- Change: add structured change kind, blast radius, external-effect, reversibility, and uncertainty facts without keyword-only routing.
- Completion: representative requests produce schema-valid, explainable facts with no Provider selection embedded in the facts.
- Verification: schema tests, scenario fixtures, serialization round trips, and false-positive/false-negative review.
- Rollback: ignore the additive facts while retaining schema-compatible stored observations.

### P4 - Proportional capability and evidence gates

- Input: P3 risk facts and current Rex Capability catalog.
- Change: select proportional safety, test, review, and evidence contracts while preserving one current Command as the sole Provider authority.
- Completion: low-risk edits avoid heavyweight chains, while risky or external-effect work receives stronger gates and evidence requirements.
- Verification: decision tables, transition tests, evidence rejection tests, and Fast/Balanced/Deep analytics derived only after execution.
- Rollback: restore existing capability selectors without changing stored workflow identity.

### P5 - Rex API, outcome, and dependency hardening

- Input: P4 transition contracts.
- Change: make command outcomes, dependency edges, blocked reasons, and API errors explicit and stable across standalone and AIOS adapters.
- Completion: standalone CLI and JS API expose equivalent semantic outcomes; invalid transitions fail closed.
- Verification: contract tests, adapter parity tests, failure-mode tests, and compatibility fixtures.
- Rollback: retain compatibility projections while disabling new fields at adapter boundaries.

### P6 - Revisioned crash-consistent persistence

- Input: stable P5 command and outcome model.
- Change: add revisions, idempotency keys, atomic replacement, journal recovery, and replay-safe evidence submission.
- Completion: repeated commands/evidence do not double-advance, and interrupted writes recover to one valid activation state.
- Verification: concurrency, crash injection, replay, corruption, and migration tests.
- Rollback: read old state through a versioned migration adapter and stop writes before destructive downgrade.

### P7 - AIOS adapter and diagnostic convergence

- Input: P6 persistence contract.
- Change: converge canonical projections, CRG freshness checks, Memo relevance, client capability gates, and doctor diagnostics around the Rex source of truth.
- Completion: adapters do not reselect Providers or duplicate workflow state, stale graph/memo results are reported clearly, and doctor output identifies unsupported client claims.
- Verification: adapter integration tests, stale-state fixtures, doctor snapshots, and projection drift checks.
- Rollback: isolate each diagnostic behind additive reporting so core workflow execution remains usable.

### P8 - Six-client smoke and staged rollout

- Input: P1-P7 accepted evidence.
- Change: run static projection, discovery, live-capability, token-budget, and unattended smoke according to each client's verified tier.
- Completion: supported clients pass live smoke; compatibility or pending-smoke clients make no unsupported claims; rollout has documented stop conditions.
- Verification: client doctor, agent doctor, per-client smoke receipts, startup token benchmarks, and staged release checklist.
- Rollback: demote affected clients to static projection and preserve the shared workflow core.

## Critical Path and Independence

The critical path is P1 -> P2 -> P3 -> P4 -> P5 -> P6 -> P7 -> P8 because later schema and persistence work depends on earlier projection and resolution boundaries. Within a phase, documentation, fixtures, and diagnostic reporting may proceed independently only when they do not share mutable workflow state. Coupled composer/emitter changes and persistence transitions remain sequential.

## Phase 1 Acceptance Contract

- Always loaded: `direct | guarded | planned`, current Rex Command ownership, local-safe versus external/destructive approval boundary, pre-edit safety, verification-before-completion, privacy/secrets red lines, and on-demand routing instructions.
- On demand: browser MCP details, Team/Harness, Model Router, detailed CRG commands, full ContextDB/Memo procedures, deprecated interception history, and client-specific operating manuals.
- Only Claude may claim a verified prompt-hook projection.
- Gemini remains static compatibility unless smoke evidence explicitly promotes it.
- Hermes receives no agents/team claims.
- Output must be independent of which shared-AGENTS client emitter owns the write.


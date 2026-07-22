# Structured Rex Change and Risk Facts Test Scope

## User Goal

Accept evidence-bearing structured assessments of change kind, blast radius,
external effect, reversibility, and uncertainty; project them as explainable
immutable Rex Facts without using prose keywords to route a Provider.

## Explicit Non-Goals

- Do not select, promote, or bind a Capability or Provider from the new facts.
- Do not alter existing keyword-derived workflow-state or specialist-domain
  behavior.
- Do not add client instructions, AIOS adapter state, persistence migration, or
  P4 proportional-gate policy.
- Do not silently infer a structured assessment from an unstructured message.

## Observable Behavior Contract

1. A `change.risk-assessed` observation with all five valid values and evidence
   references yields five named facts carrying exactly those values and source
   evidence.
2. Missing fields, unknown enum values, non-object assessments, and an
   assessment without evidence are rejected at the public evaluation boundary.
3. A structured local/reversible/low-uncertainty assessment, an
   external/system/irreversible assessment, and an unknown/high-uncertainty
   assessment retain their literal values; no value is guessed from prose.
4. An otherwise identical request produces the same Capability decision and
   portable Provider hint with and without the five structured facts. Facts
   describe conditions; they do not select a Provider in Phase 3.
5. A JSON round trip of a public software workflow preserves both the original
   structured observation and its five derived facts; recreating evaluation
   from the round-tripped request produces the same fact records.
6. Risk-looking prose without `change.risk-assessed` does not produce any of
   the five new structured facts. This is the false-positive guard; an explicit
   assessment that emits all five facts is the false-negative guard.

## Acceptance-Test Mapping

| Behavior | Observable assertion | Public test seam |
| --- | --- | --- |
| Valid projection | Five stable fact kind/value/evidence records result from one explicit observation. | `deriveSoftwareFacts()` from the package entry point. |
| Schema rejection | Invalid payloads throw at request evaluation rather than entering a workflow. | `evaluateSoftwareRequest()` from the package entry point. |
| Classification coverage | Three representative structured payloads retain their supplied values exactly. | `deriveSoftwareFacts()` fixture table. |
| No P3 routing | Capability ID, reason code, and Provider are identical for paired requests. | `evaluateSoftwareRequest()` result. |
| Serialization | Request and facts survive JSON and recompute identically. | `startSoftwareWorkflow()` result and `evaluateSoftwareRequest()`. |
| No keyword-only fact | Risky prose alone has no new structured fact kinds. | `deriveSoftwareFacts()` negative fixture. |

## Test Seam and Minimal Vertical Slice

Add one focused application test file that imports only the package public
entry point (`src/index.mjs`). Its smallest independent slice constructs a
single explicit risk-assessment observation, calls `deriveSoftwareFacts()`,
and compares the five fact records. It then extends that same public seam with
invalid, paired-routing, prose-only, and JSON round-trip fixtures.

This observes the external Rex API that both standalone CLI and adapters use;
it does not assert private helper calls, regex matches, module-local state, or
Provider implementation details.

## Completion Judgment

P3 is ready for implementation only when these facts have a closed schema,
retain provenance through serialization, are explainable at the public API,
and demonstrably leave current capability/provider selection unchanged.

The tests must not delete assertions, skip invalid inputs, weaken value
comparisons, mock the derivation path, or treat a keyword-only classification
as equivalent to a structured assessment.

# Structured Rex Change and Risk Facts: Minimal Construction Decision

## Current Boundary

`rex-harness` already separates host-supplied `Observation` from its immutable
domain `Fact` records:

- `src/domain/observation-kinds.mjs` validates raw evidence-bearing input.
- `src/application/derive-facts.mjs` turns observations into facts before a
  capability can be selected.
- `src/domain/facts.mjs` is the one normalization boundary consumed by the
  capability pack and workflow runtime.
- `src/workflows/software-workflow-runtime.mjs` persists the normalized
  request and evaluated fact projection without any Provider-specific field.

The existing text patterns classify general workflow state and specialist
domains. They cannot truthfully infer change blast radius, external effect,
reversibility, or uncertainty from prose alone. Those properties must come
from an evidence-bearing structured observation.

## Reuse Ladder

1. **Remove the need:** not applicable. Phase 3 explicitly requires stable,
   explainable structured change and risk facts as input for later proportional
   gates.
2. **Reuse existing boundaries:** applicable. Extend the existing Observation
   -> Fact derivation path and current immutable Fact shape; do not create a
   second request classifier, registry, or Provider route.
3. **Use platform facilities:** applicable. Plain frozen objects, arrays, and
   string enums are sufficient; JSON persistence already serializes the
   workflow request and fact projection.
4. **Add a dependency:** not applicable. The taxonomy is a small closed domain
   model and does not need a schema library.
5. **Use only a local expression:** insufficient. The same validation and
   projection must be shared by direct request evaluation, workflow start, and
   workflow resume/serialization tests.
6. **Smallest new construction:** introduce one focused domain module for the
   closed assessment taxonomy, then reuse it from observation normalization and
   fact derivation.

## Selected Minimal Option

Add a `change-risk-assessment` domain module containing the permitted values
and a pure normalizer for this evidence-bearing observation payload:

```js
{
  changeKind: 'behavioral' | 'structural' | 'configuration' | 'dependency' | 'data',
  blastRadius: 'local' | 'component' | 'subsystem' | 'system' | 'unknown',
  externalEffect: 'none' | 'internal' | 'external' | 'destructive' | 'unknown',
  reversibility: 'reversible' | 'compensatable' | 'irreversible' | 'unknown',
  uncertainty: 'low' | 'medium' | 'high'
}
```

Add one explicit `change.risk-assessed` Observation kind. It must carry
evidence references and the complete normalized assessment. The derivation
layer projects that payload into five immutable Facts with stable kind names,
the original evidence references, and a single optional string `value` field.
The generic Fact normalizer preserves that optional field while retaining the
existing `kind` and `evidenceRefs` contract for every older Fact.

The initial P3 capability selector deliberately ignores these five new Facts.
They describe observed engineering conditions only; P4 will decide which
proportional gates, if any, consume them. This prevents a keyword, a Fact, or
a host from embedding Provider selection in the fact layer.

## Explicit Non-Options

- Do not derive risk levels from message keywords. Existing text patterns stay
  limited to their current workflow-state behavior.
- Do not add a new risk router, client instruction, CLI flag, database, or
  AIOS-owned shadow schema.
- Do not mark a structured assessment as `HIGH_RISK_BOUNDARY` automatically.
  That is a P4 policy decision, not an observation-to-fact normalization rule.

## Focused Verification Contract

- Schema tests reject missing/unknown assessment fields and preserve all five
  values plus evidence references in immutable records.
- Scenario fixtures cover low-local-reversible, external-system-irreversible,
  and unknown/high-uncertainty assessments, proving no text keyword is needed.
- JSON serialization round-trips keep the structured observation and the five
  derived facts unchanged.
- Decision tests prove the current Capability and Provider result is unchanged
  when an otherwise identical request gains structured risk facts.
- A classification review records representative false-positive and
  false-negative boundaries: explicit structured facts are accepted; prose
  alone is not reclassified as a structured risk assessment.

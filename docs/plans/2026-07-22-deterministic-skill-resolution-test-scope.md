# Deterministic Skill Resolution Test Scope

## User Goal

For the same set of installed skill roots, every supported client must resolve
the same named Provider skill from the same canonical source regardless of
manifest enumeration order. Ambiguous duplicate names must fail closed and
produce an actionable diagnostic rather than silently selecting a first match.

## Non-Goals

- Do not alter normal client skill-discovery precedence outside AIOS-managed
  roots, add startup instructions, or add a new skill registry/CLI.
- Do not change canonical skill materialization or client overlay behavior.
- Do not change workflow Provider selection, Rex facts, or later roadmap
  phases.

## Observable Behavior Contract

1. Permuting otherwise valid catalog entries produces the same stable resolved
   entry order and canonical provenance for a selected client/scope.
2. Two distinct canonical sources targeting the same client, scope, and skill
   name are reported as one deterministic conflict containing every source;
   installation/resolution cannot silently choose either source.
3. Skills Doctor surfaces that conflict with client, scope, skill name, and
   actionable source paths, and returns an error result for the ambiguity.
4. A single canonical skill that is valid for multiple clients remains a valid
   independent per-client resolution, and existing project-over-global override
   diagnostics remain intact.

## Acceptance-Test Mapping

| Behavior | Observable assertion | Test seam |
| --- | --- | --- |
| Stable resolution | Permuted valid catalog inputs yield byte-identical ordered resolution records. | Exported catalog resolver/analysis helper. |
| Fail-closed duplicate | A duplicate target key throws or returns a typed conflict before installation. | Exported catalog resolver used by installation. |
| Actionable diagnostic | Skills Doctor reports all conflicting sources and returns nonzero errors. | `doctorContextDbSkills()` with a temporary manifest/root. |
| Six-client independence | One canonical source applicable to all six yields one valid record per client, with no cross-client conflict. | Existing all-client registry selection via Skills Doctor/component fixture. |

## Public Test Seams

- Primary integration seam: `doctorContextDbSkills()` in
  `scripts/lib/components/skills/doctor.mjs`, using a temporary manifest and
  home map in the existing component-test fixture style.
- Resolver seam: the exported catalog resolution API in
  `scripts/lib/components/skills/catalog.mjs`, because it is the stable shared
  boundary consumed by install, uninstall, and doctor paths.

The minimal vertical slice is a temporary-root doctor invocation: it observes
the actual manifest, client root selection, canonical provenance, and emitted
diagnostic without relying on private call counts. Tests must add strict
ordering and all-source assertions; they must not delete cases, skip the
conflict, or convert it into a warning-only pass.

## Completion Judgment

Phase 2 is complete when the resolver and doctor tests pass, a duplicate
fixture cannot install ambiguously, valid six-client discovery remains stable,
and the public diagnostic explains how to remove the duplicate.

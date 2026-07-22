# Deterministic Skill Resolution Refactor Review

## Refactor Check

The only post-GREEN code cleanup replaces locale-sensitive `localeCompare()`
calls with a code-unit stable comparator for skill names and canonical paths.
This preserves the tested ordering while preventing machine locale from
changing manifest resolution order.

The catalog analysis remains a small shared boundary; no new service, registry,
dependency, or client-facing instruction surface was introduced.

## Test-Diff Review

The new test suite constrains public behavior rather than implementation calls:

- it passes valid entries in both enumeration orders and compares observable
  resolved names and provenance for every registered client;
- it invokes the real resolver with two distinct source directories and expects
  a fail-closed error;
- it invokes Skills Doctor against a real temporary manifest and requires both
  source paths plus remediation wording in the diagnostic.

No existing test was removed, skipped, or relaxed. `git diff --check` reports
no whitespace error. The refactor verification passed through
`receipt:7c21edeb-bbec-44d2-816d-71f8effe3999`; the focused resolver suite
passes 2 tests and the existing component suite passes 39 tests.

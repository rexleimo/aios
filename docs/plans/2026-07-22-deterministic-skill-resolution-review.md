# Deterministic Skill Resolution Standards and Specification Review

## Review Scope

- `scripts/lib/components/skills/catalog.mjs`
- `scripts/lib/components/skills/doctor.mjs`
- `scripts/tests/skills-resolution.test.mjs`
- `docs/plans/2026-07-22-deterministic-skill-resolution-test-scope.md`

## Standards Review

No blocking standards finding.

The change keeps catalog analysis at the existing shared boundary and routes
install, uninstall, and Doctor behavior through it. It adds no dependency,
parallel registry, client startup instruction, or client-specific precedence
rule. The comparator is locale-independent, conflict source paths are sorted,
and the error path is explicit rather than relying on manifest order.

Evidence checked:

- `git diff --check -- scripts/lib/components/skills/catalog.mjs scripts/lib/components/skills/doctor.mjs scripts/tests/skills-resolution.test.mjs` exited 0.
- `node --test scripts/tests/skills-resolution.test.mjs scripts/tests/aios-components.test.mjs` exited 0 with 41 passing tests.
- Code-review-graph reports no affected execution flow for the bounded three-file change.

## Specification Review

### [P2] Preserve the project-over-global warning with a durable regression test

- **Location:** `scripts/tests/skills-resolution.test.mjs`
- **Evidence:** The test scope's observable behavior contract item 4 requires
  existing project-over-global override diagnostics to remain intact. The new
  suite proves six-client valid resolution and duplicate conflicts, but creates
  neither a global-plus-project install fixture nor an assertion for the
  `project install overrides global install` diagnostic. The changed
  `collectOverrideWarnings()` path now consumes `analyzeCatalogEntries()`, so
  this compatibility behavior is within the changed boundary.
- **Impact:** The current implementation appears to preserve the warning for a
  non-conflicting entry, but a future change to the shared analysis result or
  scope filtering could silently drop it without a focused test failing.
- **Recommended correction:** Add one temporary-root Skills Doctor test with a
  valid catalog entry installed in both global and project roots; require the
  existing override message and a warning result. Keep the duplicate-conflict
  case separate so ambiguity remains an error, not an override warning.

## Review Judgment

The deterministic resolution and actionable ambiguity behavior satisfy the
reviewed portions of the specification. The missing durable assertion above
means the full Phase 2 specification is not yet ready for final verification.

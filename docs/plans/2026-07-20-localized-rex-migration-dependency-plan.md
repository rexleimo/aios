# Localized Rex Migration Dependency Plan

## Objective and constraints

Replace the active Chinese, Japanese, and Korean `/superpowers/` pages with
Rex Workflow Migration guides, and translate their navigation label. Preserve
the URL and versioned historical changelog statements; do not alter lifecycle
cleanup behavior or publish a release in this slice.

## Dependency graph

```text
S2 review finding
  -> define public route contract and extend focused regression (RED)
  -> replace three localized route documents + navigation translations (GREEN)
  -> focused public regression + diff review
  -> standards/spec review
  -> release-wide acceptance
```

The route-contract/test step must precede the document replacement so the
existing defect is observed through public files. The three localized document
updates and the navigation translation are one shared release message, so they
are a single cohesive GREEN batch rather than unrelated parallel work.

## Work items and verification

| Step | Input and completion condition | Verification and rollback point |
| --- | --- | --- |
| Define/red | The S2 review finding; extend the existing public release-doc test to require Rex-only migration text for `zh`, `ja`, and `ko` pages and localized nav labels. Completion requires a failing public assertion before the pages change. | Focused `node --test --test-name-pattern "public release documentation describes ownership-safe Rex-only migration" scripts/tests/release-pipeline.test.mjs`; if it does not fail for the old page, stop and correct the test seam. |
| Green | The accepted public route contract. Replace only the localized `superpowers.md` contents and four MkDocs localization map values. Completion requires each route explaining Rex-only ownership-safe cleanup. | Rerun the focused test and review the four page diffs; if translation or behavior diverges, restore only the affected new content and correct it. |
| Harden | Passing focused contract. Verify links/heading boundaries and ensure versioned changelog history remains untouched. | `git diff --check` plus targeted historical-entry inspection; no versioned history changes are allowed. |
| Release acceptance | Completed localized route review. Run the full repository release gates and report blockers without fabricating evidence. | Root tests, MCP typecheck/test/build, generated sync, training/client gates, and release preflight as applicable. |

## Shortest critical path

`RED contract -> localized guide/nav GREEN -> focused verification -> review ->
release acceptance`. No independent implementation domain exists before the
shared public-message contract is established.

# Dependency-Ready Transition Standards and Specification Review

## Standards

No blocking finding. The ready-feature policy stays in
`src/domain/long-running-delivery.mjs`, consumes only existing ledger fields,
and preserves the immutable return shape. No host scheduler, generic utility,
or cross-layer dependency was introduced. `git -C rex-harness diff --check` is
clean.

## Specification

The reviewed slice satisfies dependency-aware selection: after acceptance, the
first declared pending feature with all accepted dependencies becomes the sole
current feature. The public test covers a dependency declared before its
prerequisite, which the prior index-based selection could not handle. The
planned `dependencies-unresolved` decision and typed outcome projection are
not implemented or claimed by this review; they remain the next bounded slice.

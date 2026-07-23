# Rex Projection Semantic Parity Implementation

## Implemented Delta

`presentCliWorkflow()` now adds `blockedReason` only when the core result
contains one, preserving the prior compact shape for ordinary results.

The standalone persistence projection now forwards `advanced.blockedReason` to
its public result. When a result contains an explicit blocked reason, it keeps
the already-sealed current command rather than rotating its execution token.
Accepted partial evidence still seals its replacement command as before.

## Boundary Preservation

The changes do not select a Capability, validate evidence differently, choose
a Provider, or change the AIOS binding. They preserve information already
returned by the Rex core across the standalone store and compact CLI boundaries.

## Regression Coverage

The new standalone CLI scenario reaches TDD RED using real stored receipts,
then submits a receipt with a mismatched scenario. It asserts all Rex-owned
compact fields for the blocked result: outcome, blocked reason, status,
workflow identity, work-item identity, current command token, and missing
evidence.

Verification:

- `receipt:196b2d6c-78c8-4daf-993b-3149c35b857c` records the declared public
  projection scenario passing after the change.
- `receipt:372de106-bf1f-4e3c-8077-1e170f218aab` records the standalone CLI
  suite passing with four tests.

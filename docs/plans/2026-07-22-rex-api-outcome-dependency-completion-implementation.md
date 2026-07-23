# Remaining P5 Dependency Graph Validation Implementation

The long-running delivery domain now validates its normalized dependency graph
before creating a ledger. It rejects unknown references, duplicate edges,
self-dependencies, and cycles with stable `TypeError` messages. Valid edges
remain immutable ledger data, while existing no-dependency workflows retain
their startup behavior.

Verification:

- `receipt:3e69cc2e-8884-410e-851d-cd56b797366a` records the public dependency
  contract suite passing with exit status 0.
- `node --test rex-harness/tests/workflows/long-running-delivery.test.mjs`
  passed 5/5.
- `git -C rex-harness diff --check` completed with no output.

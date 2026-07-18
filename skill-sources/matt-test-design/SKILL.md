---
name: matt-test-design
description: Use only after AIOS/rex-harness selects behavior-focused test design and supplies the current Command.

installCatalogName: matt-test-design
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, testing, tdd, balanced]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Matt Test Design

Use this procedure only after rex-harness selected `software.testing.design`.

Choose tests that protect behavior, not implementation details.

1. Name public seams using the agreed domain vocabulary.
2. Confirm the highest-value seams and independent expected outcomes before coding.
3. Slice vertically: one behavior, one failing test, one minimal implementation.
4. Avoid tautological assertions, private collaborators, and broad speculative test matrices.

Return `acceptance-test-mapping-recorded` and `test-seam-recorded` with real artifact or decision refs. When the host requests `AIOS_REX_EVIDENCE`, end with exactly one envelope for the current `activationId`.

If strict red-green discipline appears necessary, record the risk observation and return control. Do not invoke the next Provider.

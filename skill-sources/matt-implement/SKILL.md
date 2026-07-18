---
name: matt-implement
description: Use only after AIOS/rex-harness selects bounded implementation execution and supplies the current Command.

installCatalogName: matt-implement
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, implementation, balanced]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Matt Implement

Use this procedure only after rex-harness selected `software.implementation.execute`.

Implement only the approved spec and agreed test seams.

1. Invoke `pre-edit-safety-gate` before changing code.
2. Work in small vertical slices; run focused tests and typechecks as each slice lands.
3. Keep the change within the spec; record new ambiguity as an observation and return control rather than invoking requirements yourself.
4. Return `implementation-diff-recorded` and `focused-tests-pass` with real artifact or command refs.

When the host requests `AIOS_REX_EVIDENCE`, end with exactly one envelope for the current `activationId`. Do not invoke Review, Superpowers, subagents, or ECC roles. Do not invoke the next Provider; the Activation decides it from evidence.

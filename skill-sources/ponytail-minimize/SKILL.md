---
name: ponytail-minimize
description: Use only after AIOS/rex-harness selects implementation minimization and supplies the current Command.

installCatalogName: ponytail-minimize
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, implementation, simplicity, ponytail]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Ponytail Minimize

Use this procedure only after rex-harness selected `software.implementation.minimize`.

Evaluate the proposed construct in order:

1. Confirm whether it needs to exist.
2. Reuse project code when it already expresses the behavior clearly.
3. Prefer the platform or standard library when it satisfies the constraints.
4. Reuse an existing dependency without expanding the dependency surface.
5. Prefer a clear local expression over a new named construct.
6. If none is sufficient, record the smallest new construct that preserves correctness.

Return `reuse-ladder-evaluated` and `minimal-option-recorded` with real decision or artifact refs. When the host requests `AIOS_REX_EVIDENCE`, end with exactly one envelope for the current `activationId`.

Simplicity never overrides correctness, security, or required reliability. Do not implement the option or select another Capability. Do not invoke the next Provider.

---
name: matt-code-review
description: Use only after AIOS/rex-harness selects standards-and-spec review and supplies the current Command.

installCatalogName: matt-code-review
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, review, standards, spec]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Matt Code Review

Use this procedure only after rex-harness selected `software.review.standards-spec`.

Review the diff on two independent axes. Do not merge the findings.

| Axis | Check |
| --- | --- |
| Standards | Repository conventions, clear names, duplication, inappropriate primitives, needless abstractions, and tooling findings. |
| Spec | Missing criteria, wrong behavior, scope creep, and unverified edge cases. |

Report each finding with file evidence, severity, and a concrete action. State "no spec available" rather than inventing a Spec verdict. Return `standards-review-recorded` and `spec-review-recorded` with real artifact or review refs. When the host requests `AIOS_REX_EVIDENCE`, end with exactly one envelope for the current `activationId`.

This rubric feeds the existing AIOS review and evidence gates; it does not replace them or require parallel agents for a bounded change. Do not invoke the next Provider.

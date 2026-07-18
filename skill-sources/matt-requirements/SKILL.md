---
name: matt-requirements
description: Use only after AIOS/rex-harness selects software requirements clarification and supplies the current Command.

installCatalogName: matt-requirements
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, requirements, domain, balanced]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Matt Requirements

Use this procedure only after rex-harness selected `software.requirements.clarify`.

Turn a bounded request into a small, executable behavioral spec without creating a second engineering plan.

1. Read existing domain vocabulary and relevant decisions before asking questions.
2. Resolve one ambiguity at a time: actor, trigger, observable outcome, boundary, and failure case.
3. Record canonical terms, acceptance criteria, non-goals, and the smallest testable seams.
4. Stop when an implementer can make one vertical slice without guessing. If the path remains unknown, record that evidence and return control to the Activation instead of invoking another Skill.

Return `acceptance-criteria-recorded`, `non-goals-recorded`, and `first-slice-identified` with real artifact or decision refs. When the host requests `AIOS_REX_EVIDENCE`, end with exactly one envelope for the current `activationId`.

Do not choose architecture, dispatch agents, or bypass AIOS plan, privacy, and edit gates. Do not invoke the next Provider.

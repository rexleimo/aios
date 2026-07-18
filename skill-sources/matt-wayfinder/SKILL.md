---
name: matt-wayfinder
description: Use only after AIOS/rex-harness selects decision wayfinding and supplies the current Command.

installCatalogName: matt-wayfinder
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [workflow, planning, decisions, wayfinder]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
---

# Matt Wayfinder

Use this procedure only after rex-harness selected `software.navigation.wayfind`.

Map decisions; do not implement.

1. State the destination and scope boundary.
2. Capture only currently clear decision questions, their dependencies, and unresolved fog.
3. Resolve one decision at a time and persist its evidence in the project's approved planning or tracker surface.
4. Stop when the implementation path is clear and return control to the Activation.

Return `destination-recorded`, `decision-map-recorded`, and `next-slice-identified` with real artifact or decision refs. When the host requests `AIOS_REX_EVIDENCE`, end with exactly one envelope for the current `activationId`.

Do not continue into implementation or choose a workflow depth. Do not invoke the next Provider.

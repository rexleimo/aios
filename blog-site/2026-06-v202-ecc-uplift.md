---
title: "v2.0.2: Safer Skill Health Records and Cleaner Crush Config"
description: "Harness CLI v2.0.2 hardens skill health telemetry, fixes help routing for new CLI surfaces, and removes tracked Crush config files from the repository."
date: 2026-06-15
tags: ["release", "CLI", "skills", "Crush", "configuration"]
---

# v2.0.2: Safer Skill Health Records and Cleaner Crush Config

v2.0.2 is a small release with a big operational theme: keep local agent state honest, discoverable, and out of the repository.

## Skill health now rejects unknown statuses

`recordSkillObservation()` used to normalize anything other than `success` into `failure`. That made dashboards look conservative, but it also hid producer bugs. A typo, legacy value, or future enum could silently inflate failure counts.

The writer now accepts only:

- `success`
- `failure`

Anything else throws before the observation is persisted. This keeps `.aios/skill-health/observations.jsonl` as a reliable telemetry stream instead of a dumping ground for malformed producer output.

## Help flags win before positional validation

The new `skill` and `session` parser surfaces now handle help before enforcing required subcommands or paths. These commands now show usage instead of throwing missing-argument errors:

```bash
node scripts/aios.mjs skill --help
node scripts/aios.mjs skill comply --help
node scripts/aios.mjs session --help
node scripts/aios.mjs session changed-files --help
```

That matters for recovery: if an agent or human lands on a new command surface, `--help` must always be the escape hatch.

## Crush config leaves the repository

The tracked `.crush.json` and `crush.json` files were removed from git and added to `.gitignore`.

AIOS still supports generating or reading local Crush config files when a workspace needs Crush MCP wiring. The change is about ownership: local tool config belongs on the machine, not in the shared repository history.

## Verification

The release adds regression coverage for both fixes:

- invalid skill health statuses reject before writing
- `skill` and `session` help flags bypass positional validation

Full release verification also rebuilds the docs and blog site so the generated website matches the source content.

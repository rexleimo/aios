---
title: "v6.0.1: Engineering Standards Move to rex-harness — The Baseline Lives With Its Consumers"
description: "v6.0.1 moves the engineering-standards skill from the AIOS host into the rex-harness submodule as rex-engineering-standards (release 0.7.0): the capability chain's shared quality baseline now ships with the capability chain, and standalone rex-harness consumers no longer miss it."
date: 2026-09-21
tags: ["AIOS", "engineering-standards", "rex-harness", "architecture", "release", "v6.0.1"]
---

# v6.0.1: Engineering Standards Move to rex-harness — The Baseline Lives With Its Consumers

> **Quick Answer:** v6.0.0 shipped the engineering standard as a host skill, `aios-engineering-standards`. That put the dependency direction backwards: the four providers that consume the standard (`rex-implement`, `rex-refactor-hardening`, `rex-code-review`, `rex-design`) all live in the `rex-harness` submodule, and rex-harness is a standalone, npm-published control plane. v6.0.1 corrects this in one move: the skill now ships as `rex-engineering-standards` from `rex-harness` 0.7.0, registered in its projection history. Content and Definition of Done are unchanged; the router and `pre-edit-safety-gate` reference the new name.

## Why the move

Two facts made the original placement wrong:

1. **The consumers are in the submodule.** Every code-producing provider reads the standard before it runs. A baseline whose readers all live in one repository, but which itself lives in another, is an inverted dependency — the engine referencing the host's catalog.
2. **rex-harness is standalone.** `@rexleimo/rex-harness` publishes to npm with `skill-sources/` in its `files` and describes itself as a standalone evidence-driven workflow control plane. A rex-only consumer (no AIOS host) would have had four providers referencing a skill that does not exist there. The quality baseline silently disappeared outside AIOS.

The standard will also keep evolving with the capability chain — evidence contracts, provider steps, gates. Co-locating means one repository, one changelog, one version story per change.

## What changed

- The skill ships from `rex-harness/skill-sources/rex-engineering-standards/` (rex-harness 0.7.0), digest registered in `src/clients/projection-history.json` so client projections upgrade cleanly.
- Host catalog is back to 27 skills; the rex projection is now 14.
- `aios-workflow-router` and `pre-edit-safety-gate` load and reference `rex-engineering-standards` — the same by-name pattern the router already uses for `rex-*` providers.
- The engineering standard itself — boundaries, deep modules, code baseline, test bar, toolchain bar, ADD, Definition of Done — is unchanged.

## What did not change

Everything user-facing stays as shipped in v6.0.0: the router still loads the standard before any code-producing provider, completion still requires the provider evidence contract **and** the Definition of Done, and there is still no skip-quality route. The public [Engineering Standards page](/engineering-standards/) and its reference materials are unchanged apart from the skill name.

## Upgrade

Run `aios update` (or `aios init --all`) to re-project skills; the new `rex-engineering-standards` replaces the old host projection automatically. No configuration, nothing to route around.

## See also

- [v6.0.0: Engineering Standards — AIOS Builds Software, Not Just Code](/blog/2026-09-v600-engineering-standards/)
- [Engineering Standards docs](/engineering-standards/)

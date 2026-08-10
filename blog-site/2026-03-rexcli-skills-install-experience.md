---
title: "AIOS Skills Install Experience Update: Global/Project Scope and a Clearer Picker"
description: "This update improves the skills install/uninstall experience, consolidates canonical sources into skill-sources/, switches the default install mode to a portable copy, and standardizes the Node runtime baseline on 22 LTS."
date: 2026-03-17
tags: [AIOS, Skills, TUI, Onboarding, AI Development]
---

# AIOS Skills Install Experience Update: Global/Project Scope and a Clearer Picker

This iteration focused on two practical problems:

1. Not every skill should appear by default in every project, especially skills that carry strong business or repo-specific semantics.
2. Keeping “skill source files” and “installed skill targets” in the same directory tree makes cross-machine and cross-project syncing increasingly hard to maintain.

To address these, AIOS tightened the skills lifecycle (install/uninstall/sync) and clarified the boundaries between:

- system core capabilities,
- optional extensions,
- canonical source tree,
- generated compatibility outputs.

## Canonical Source Tree Moves to `skill-sources/`

The canonical skill authoring source is no longer `.codex/skills` or `.claude/skills`.

The new contract is:

- `skill-sources/` is the canonical source tree
- `.codex/skills`, `.claude/skills`, `.agents/skills`, `.gemini/skills`, `.opencode/skills` are generated compatibility trees
- repo-local compatibility trees are written/updated by `node scripts/sync-skills.mjs`

This means: when copying skills across machines/projects, treat `skill-sources/` as the source of truth, not one specific client directory.

In addition, `node scripts/check-skills-sync.mjs` is now part of release preflight so generated outputs cannot drift silently from the canonical source tree.

## Global vs Project Scope Installs

Skills install now supports explicit scope selection:

- `global`: installs into a user-wide directory (e.g. `~/.codex/skills`)
- `project`: installs into the current repository directory (current `pwd`)

This lets you keep general-purpose methodology skills global while keeping strongly business/repo-coupled skills scoped to a single project.

## Catalog-Driven Installs (Not “Scan and Install Everything”)

Installs are now driven by a curated catalog rather than “whatever is found under a directory”.

The practical outcome:

- less accidental tool pollution,
- clearer “what is installed and why” visibility in the TUI,
- safer defaults when onboarding new projects.

## Related Links

- Docs: `/superpowers/`
- Repo: <https://github.com/rexleimo/aios>

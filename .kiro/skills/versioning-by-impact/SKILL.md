---
name: versioning-by-impact
description: Use when completing a task and deciding whether repository changes require a semantic version bump and changelog entry before commit/push.
---

# Versioning by Impact

## Overview
Apply Semantic Versioning decisions from actual change impact, not from task size.

## Impact Rules

- `none`: no repository file changes.
- `patch`: backward-compatible fixes, docs updates, translation/content updates, non-breaking refactors.
- `minor`: backward-compatible new features or new capabilities.
- `major`: any breaking change to CLI behavior, config contract, file layout contract, or documented usage.

## Required Output Format

Always report these 4 fields in final handoff:

1. `Version Impact: none|patch|minor|major`
2. `Recommended Version: vX.Y.Z -> vA.B.C` (or `no change`)
3. `Why: <one-sentence reason>`
4. `Release Notes:` short bullet list

## Repository Commands

- Read current version: `cat VERSION`
- Bump version + changelog entry: `scripts/release-version.sh <patch|minor|major> "summary"`
- Preview only: `scripts/release-version.sh --dry-run <patch|minor|major> "summary"`

## Default Behavior

If impact is `none`, do not bump version.
If impact is `patch|minor|major`, update both `VERSION` and `CHANGELOG.md` before commit.

---
title: "v5.5.1: Evidence-Driven Agent Lifecycle Promotion"
description: "v5.5.1 removes the hardcoded Agent promotion bottleneck: every canonical role is smoke-tested by default and verified managed evidence promotes it into live workflow orchestration."
date: 2026-08-08
tags: ["AIOS", "agents", "smoke", "workflow", "release"]
---

# v5.5.1: Evidence-Driven Agent Lifecycle Promotion

v5.5.0 introduced live Agent smoke evidence, but the catalogue still had a hardcoded six-Agent promotion list. That meant an Agent could have valid smoke, provenance, and bidirectional metrics evidence and still remain blocked as a candidate.

## What changed

- `agents smoke` now covers all 19 canonical Agent roles by default, including documentation, React, refactor, and TypeScript specialists.
- Verified managed evidence promotes any canonical Agent to `projected`.
- Unverified or malformed evidence remains fail-closed.
- Status messages distinguish Agent blockers from quality-gate blockers.
- macOS `/var` and `/private/var` path aliases are canonicalized in the projection contract test.

## Verification

The v5.5.1 smoke run passed all 19 canonical Agent roles with Codex. Rex workflow policy passed 74/74 tests, Rex integration passed 52/52, and the full root suite passed 1023 tests with 10 designed skips and zero failures.

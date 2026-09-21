---
title: "v6.0.0: Engineering Standards — AIOS Builds Software, Not Just Code"
description: "v6.0.0 turns the classic software-engineering reading list into a framework citizen: every code-producing step loads the same quality baseline — Clean Architecture boundaries, deep modules, Clean Code rules, testing and toolchain bars — and nothing counts as done until it passes the Definition of Done."
date: 2026-09-21
tags: ["AIOS", "engineering-standards", "code-quality", "architecture", "release", "v6.0.0"]
---

# v6.0.0: Engineering Standards — AIOS Builds Software, Not Just Code

> **Quick Answer:** Coding agents generate code that runs; the code still fails review for the same reasons every time — boundary violations, shallow abstractions, lying names, no test net, no toolchain. These are standards problems, and standards belong in the framework, not in a wiki page nobody opens. v6.0.0 ships `aios-engineering-standards`: one quality baseline derived from the classic books (Clean Architecture, A Philosophy of Software Design, Clean Code, The Pragmatic Programmer, Refactoring) that the router loads **before** any code-producing provider runs, and a Definition of Done that every change must pass alongside the existing evidence contract. Docs and reference materials (the nine-book reading list, free legal resources, book-principle → AIOS-mechanism mapping) ship in en/zh/ja/ko.

## The failure mode: capable generators, unengineered output

The workflow could already write correct code. Tests ran, diffs were produced, reviews happened. And yet the thing that came back was consistently *unengineered*:

1. **Boundary violations.** Business logic reached into frameworks, storage, and UI details. One requirement change broke three layers at once.
2. **Shallow abstractions.** Wrappers that forwarded and forwarded; parameters reserved for futures that never arrived. Net complexity, zero information hidden.
3. **Naming and shape drift.** Functions doing four things, names that lied, error codes decoded in a dozen places.
4. **No safety net.** Without tests, every refactor was a prayer and every review restarted from zero.
5. **No toolchain.** No lint, no pre-commit, no CI — standards lived in someone's memory instead of in the pipeline.

Notice what is *not* on that list: "the algorithm was wrong." Model capability was never the bottleneck. **Standards were.** And the reference material's落地 advice is blunt about where standards live: build a boilerplate with lint, pre-commit hooks, and CI so engineering standards become an automated pipeline — not a document.

## What changed in v6.0.0

### 1. `aios-engineering-standards` — the baseline as a skill

One skill, loaded by the framework, that every code-producing step shares. It encodes the classic reading list as operational rules:

- **Architecture boundaries (Clean Architecture).** Source dependencies point inward only; domain logic never imports framework, driver, or UI details. High cohesion, low coupling, minimal interface. If you cannot honestly name a boundary, the design is not thought through — go back to design options instead of writing through the fog.
- **Deep modules (A Philosophy of Software Design).** Complexity is the cost to understand plus the cost to change. Small interface, deep implementation beats a stack of thin forwarders. Delete speculative generality. Strategic programming over tactical: every change leaves the codebase a little better.
- **Code baseline (Clean Code / The Pragmatic Programmer).** Names express intent; functions do one thing at one level; errors carry context instead of return codes; DRY means one authoritative representation per piece of knowledge; orthogonality means one change touches one place.
- **Testing bar.** Core logic carries automated coverage; refactors happen only behind green tests; assertions are never weakened to make a build pass.
- **Toolchain bar.** New projects, packages, and modules ship with lint, pre-commit hooks, CI, a test framework, and structured logging — the standard is enforced by machines, not by review memory.
- **Documentation bar.** Consequential changes record a short ADD: decision, conditions, tradeoffs, rejected options.

### 2. The router loads it before code-producing providers

`aios-workflow-router` now loads the standard **first** whenever the selected provider is `rex-implement`, `rex-refactor-hardening`, `rex-code-review`, or `rex-design`. The completion gate is extended: those stages require **both** the provider's evidence contract **and** the standard's Definition of Done.

This is deliberately not a new gate bolted onto the side. There is no "skip quality" route, because the standard is loaded by the router — it rides the same evidence-driven chain as everything else, and every stage still unlocks only on real evidence.

### 3. `pre-edit-safety-gate` checks the change shape against it

Before the first edit of a batch, the gate already decides the change shape (local change / extend / refactor). It now additionally checks that shape against the baseline: dependency direction, deep-module heuristic, naming, tests, toolchain. Design evidence and quality evidence come from the same source.

### 4. Definition of Done — eight rows, no vibes

| # | Item | Pass bar |
| --- | --- | --- |
| 1 | Behavior meets acceptance | Implement self-check all "yes" |
| 2 | Boundaries clear | Right module/layer; dependency direction intact; no interface leaks |
| 3 | Modules deep enough | New abstractions hide real detail; no thin forwarders, no reserved parameters |
| 4 | Naming and functions | Names match reality; single abstraction level; unified error handling |
| 5 | Test coverage | Core path automated; assertions not weakened |
| 6 | Toolchain | Lint / pre-commit / CI / logging at baseline |
| 7 | Documentation | ADD for consequential changes; contracts updated |
| 8 | Evidence | Evidence envelope cites real receipts |

Any "no" means keep working — the same discipline the implement self-check already uses, now with the engineering baseline inside it.

## Why this makes AIOS more than a traditional agent

A traditional coding agent helps you *write* code. AIOS runs the engineering loop, and has for several versions: requirements alignment before planning, design decisions with rejected options recorded, behavior-preserving hardening with scenario receipts, review against a Fowler smell baseline and a fixed-point diff — every stage unlocking only on typed evidence.

v6.0.0 closes the one remaining gap: **what "good" means is now a framework citizen, not a hope.** The agent does not need to remember your style guide; the router hands it the standard before it writes a line, and the completion gate checks the result against it. That is the difference between a code generator and a software engineering system.

## Reference materials

The full standard, the four-stage capability model, the nine-book reading list (Clean Code, Refactoring 2, The Pragmatic Programmer 2, Design Patterns, Clean Architecture, DDIA, A Philosophy of Software Design, The Mythical Man-Month, Making Things Happen), free legal resources (community translations, `system-design-primer`, aosabook.org, Pro Git, Software Engineering at Google, refactoring.guru, Google style and code-review guides, roadmap.sh), and the book-principle → AIOS-mechanism mapping are on the public docs page: [Engineering Standards](/engineering-standards/).

## Upgrade

Run `aios update` (or `aios init --all`) to project the new skill into your clients' skill roots, then restart the client. The standard loads automatically on the next code-producing task — nothing to configure, nothing to route around.

## See also

- [Engineering Standards docs](/engineering-standards/)
- [Workflow Policy](/workflow-policy/)
- [v5.20.0: Qoder joins as the tenth client](/blog/2026-09-v520-qoder-client/)

---
title: Engineering Standards — AIOS Builds Software, It Does Not Just Generate Code
description: "AIOS 6.0 builds classic software-engineering standards into the workflow: Clean Architecture boundaries, deep modules, Clean Code rules, testing and toolchain baselines — a Definition of Done for every generated change, plus the reference reading list and free resources."
---

# Engineering Standards

## Quick Answer

Traditional coding agents generate code that runs. AIOS generates code that is **engineered**. Since v6.0.0, every code-producing step in the workflow loads the same quality baseline — the `rex-engineering-standards` skill: architecture boundaries from *Clean Architecture*, deep modules from *A Philosophy of Software Design*, naming and function rules from *Clean Code*, DRY and orthogonality from *The Pragmatic Programmer* — and no change counts as done until it passes a Definition of Done. The standard rides the existing evidence-driven capability chain; it is not another gate you can route around. This page is the public standard and carries the reference materials: the four-stage capability model, the nine-book reading list, and free legal resources.

## Why: the quality gap in generated code

Generated code fails review for predictable reasons, and almost none of them are "the algorithm is wrong":

- **Boundary violations** — business logic reaches into frameworks, storage, and UI details, so the next change breaks three layers at once.
- **Shallow abstractions** — wrappers that forward and forward, parameters reserved for futures that never arrive: net complexity with zero information hidden.
- **Naming and shape drift** — functions that do four things, names that lie, error codes checked in twelve places.
- **Missing safety net** — no tests, so every refactor is a prayer and every review restarts from zero.
- **Missing toolchain** — no lint, no pre-commit, no CI: standards live in someone's memory instead of in the pipeline.

These are not model-size problems. They are **standards problems**, and standards belong in the framework, not in a wiki page nobody opens.

## What AIOS already does that traditional agents do not

AIOS is a local-first orchestration control plane, not a chat wrapper around a code generator. Software engineering capability is already structural here — v6.0.0 makes the quality half explicit:

| Traditional coding agent | AIOS |
| --- | --- |
| Generates a diff and hopes | Every stage produces typed evidence (`implementation-diff-recorded`, `focused-tests-pass`, receipts) before the next stage unlocks |
| "Done" means the model said so | Done means the Definition of Done checklist plus the evidence contract both pass |
| Standards live in a style guide nobody loads | The standard is a skill the router loads **before** code-producing providers run |
| Review is vibes | Review runs a Fowler smell baseline plus spec and standards axes against a fixed-point diff |
| Quality is a final polish | Quality gates are wired into plan → implement → harden → review |

In short: a traditional agent helps you *write* code. AIOS runs the engineering loop — requirements alignment, design decisions with rejected options recorded, behavior-preserving hardening, evidence-backed review — and now, a shared quality baseline for everything that gets written.

## The baseline

### 1. Architecture boundaries (Clean Architecture)

- **Dependency rule**: source dependencies point inward only. Domain logic never imports framework, driver, or UI details; outer layers depend on interfaces the domain defines.
- **Cohesion and coupling**: things that change together live in one module; a module changes for exactly one reason.
- **Minimal interface**: a module hides its details behind the smallest honest interface. Framework types, storage shapes, or third-party DTOs in an interface are boundary leaks.
- **Naming is the boundary test**: if you cannot honestly name a module or a boundary, the design is not thought through — go back to design options instead of writing through the fog.

### 2. Deep modules (A Philosophy of Software Design)

- Complexity is the cost to understand plus the cost to change. Judge every new abstraction against that sum.
- **Prefer deep modules**: a small interface with a large, well-hidden implementation beats a stack of thin forwarders.
- **Suspect shallow modules**: interfaces as large as their implementations, wrappers that add no information hiding, parameters reserved for speculative futures — delete them.
- **Strategic over tactical programming**: every change leaves the codebase a little better (the Boy Scout rule); shipping fast and improving structure are not either/or.
- **Comments are a design tool**: if you cannot write a clear comment, the boundary or responsibility is fuzzy — fix the design first; comments should explain *why*, not narrate *what*.

### 3. Code baseline (Clean Code / The Pragmatic Programmer)

- Names express intent; rename before you reason. A function does one thing at one level of abstraction.
- Errors are expressed as exceptions or error types with context — not return codes the caller must decode at every call site.
- DRY: one piece of knowledge has one authoritative representation. Two similar-looking blocks are merged only when they are the *same* knowledge — accidental similarity is cheaper than wrong coupling.
- Orthogonality: one requirement change touches one place. If your mental diff has five files, that is a structural signal, not bad luck.

### 4. Testing baseline

- Core logic carries automated coverage (unit plus integration where it matters); refactors and hardening happen only behind green tests.
- Never weaken an assertion, delete a case, or skip a suite to make a build pass. Tests are the evidence that behavior did not change — without them, refactoring is prayer.

### 5. Toolchain baseline (standards as automation)

> Rules a machine can check should not depend on human review memory. The reference material's落地 advice: ship a boilerplate with lint, pre-commit hooks, and CI so engineering standards become an automated pipeline.

New projects, packages, and modules must ship with:

- [ ] Lint and formatting configuration consistent with the repository's existing standard
- [ ] Pre-commit hooks (lint plus fast tests)
- [ ] CI configuration (lint plus static checks plus the full test suite)
- [ ] A test framework with at least one runnable core-path test
- [ ] Structured, leveled, searchable logging — not bare prints

Existing repositories follow their own recorded standard first; gaps are recorded in the delivery notes, never silently ignored and never replaced by a parallel private convention.

### 6. Documentation baseline

- Consequential changes — anything touching boundaries, interfaces, data structures, or operational behavior — record a short ADD: the decision, its conditions, the tradeoffs, and the rejected options. Same shape as the design skill's decision record; it does not grow into an implementation plan.
- API and public-interface contracts update with the change. Knowledge that lives only in someone's head counts as incomplete.

## Definition of Done

Claiming "done" requires every row; any "no" means keep working:

| # | Item | Pass bar |
| --- | --- | --- |
| 1 | Behavior meets acceptance | The implement self-check table is all "yes" |
| 2 | Boundaries are clear | Change sits in the right module/layer; dependency direction intact; no interface leaks |
| 3 | Modules are deep enough | New abstractions hide real detail; no thin forwarders, no reserved parameters |
| 4 | Naming and functions | Names match reality; single level of abstraction; unified error handling |
| 5 | Test coverage | Core path automated; assertions not weakened |
| 6 | Toolchain | Lint / pre-commit / CI / logging at the §5 baseline |
| 7 | Documentation | ADD for consequential changes; interface contracts updated |
| 8 | Evidence | Evidence envelope cites real receipts (tests, diffs, scenarios) |

## How it rides the workflow

```text
router (aios-workflow-router)
  └─ code-producing provider selected (rex-implement / rex-refactor-hardening / rex-code-review / rex-design)
       └─ rex-engineering-standards loaded FIRST  ← the shared baseline
            └─ provider runs its own evidence-driven steps
                 └─ completion requires BOTH the provider's evidence contract AND this Definition of Done
```

`pre-edit-safety-gate` additionally checks the chosen change shape (local change / extend / refactor) against the baseline before the first edit. No stage can opt out; there is no "skip quality" route, because the standard is loaded by the router, not by politeness.

## Reference materials

### The four-stage engineering capability model

The reference conversation frames engineering growth as four stages, and AIOS maps onto all four:

1. **Single-player fundamentals — code quality and refactoring**: lint/format discipline, KISS and DRY, the Boy Scout rule, unit and integration tests as refactoring insurance.
2. **System thinking — design patterns and module division**: SOLID, high cohesion and low coupling, minimal interfaces, encapsulation of details.
3. **Engineering automation — CI/CD and quality governance**: Conventional Commits, Gitflow/Feature Branch, pipelines that run lint, static analysis, and tests on every commit or PR, structured logging and metrics.
4. **Complexity control — project management and delivery**: MVP decomposition with risk buffers, Architecture Design Documents, API docs, requirement traceability.

### The reading list

| Book | Core value |
| --- | --- |
| *Clean Code* — Robert C. Martin | The guide out of "bad code": naming, functions, exceptions, and class organization |
| *Refactoring* (2nd ed.) — Martin Fowler | Behavior-preserving, small-step improvement of internal structure, driven by the smells catalog |
| *The Pragmatic Programmer* (2nd ed.) — Hunt & Thomas | The personal craft guide: attitude, habits, tool choices, and problem-solving thinking |
| *Design Patterns* — GoF | The source of the 23 patterns: reusable solutions to recurring design problems (start with *Head First Design Patterns* if the original feels abstract) |
| *Clean Architecture* — Robert C. Martin | The nature of architecture: drawing boundaries, isolating dependencies, decoupling business logic from databases and UI frameworks |
| *Designing Data-Intensive Applications* — Martin Kleppmann | The distributed-systems and backend read: storage, consistency, scalability, fault tolerance |
| *A Philosophy of Software Design* — John Ousterhout | The minimal architecture book: controlling complexity, deep modules, tactical vs strategic programming |
| *The Mythical Man-Month* — Frederick P. Brooks Jr. | Why adding people to a late project makes it later; conceptual integrity; essential vs accidental complexity |
| *Making Things Happen* — Scott Berkun | Project management from a veteran PM: requirements definition, technical decisions, risk assessment, cross-team communication |

### Free and legal resources

- **A Philosophy of Software Design** — community-maintained Chinese translations and deep-dive notes on GitHub
- **Clean Architecture** — open concept guides plus runnable examples (`clean-architecture-go`, `clean-architecture-python` on GitHub)
- **System Design Primer** — `donnemartin/system-design-primer` on GitHub (250k+ stars, includes a full Chinese translation)
- **Architecture of Open Source Applications** — `aosabook.org`, free online
- **Pro Git** — `git-scm.com/book/zh/v2`, official free Chinese edition (online plus EPUB/PDF)
- **Software Engineering at Google** — free online at `abseil.io/resources/swe-book`; community Chinese translation on GitHub
- **Refactoring.Guru** — `refactoring.guru`, illustrated patterns and refactorings with multi-language examples (free Chinese content)
- **Google Style Guides** — `google/styleguide` on GitHub (C++, Python, Go, TypeScript)
- **Google Code Review Developer Guide** — how to review code well; Chinese translation on GitHub
- **Roadmap.sh** — `roadmap.sh`, community-driven skill maps for backend, DevOps, and system design
- Public library digital lending (many city/provincial libraries offer free e-reader cards) and legitimately free platforms for the commercial titles

### Book principle → AIOS mechanism

| Book principle | AIOS mechanism |
| --- | --- |
| Clean Architecture dependency rule, boundaries | §1 baseline + `pre-edit-safety-gate` change-shape check + `rex-design` options |
| Deep modules, complexity budget | §2 baseline + Definition of Done rows 2–3 |
| Clean Code naming/functions/errors | §3 baseline + `rex-code-review` standards axis |
| Fowler smells, behavior-preserving change | `rex-code-review` smell baseline + `rex-refactor-hardening` receipts |
| Pragmatic Programmer DRY/orthogonality | §3 baseline + reuse-first rule in `pre-edit-safety-gate` |
| Testing as refactoring insurance | `rex-tdd` / `rex-strict-tdd` / `verification-loop` + DoD row 5 |
| Standards as automation (boilerplate + lint + pre-commit + CI) | §5 toolchain baseline |
| ADD, conceptual integrity | §6 documentation baseline + typed decision records |
| Brooks: essential vs accidental complexity | Deep-module heuristic; delete speculative generality |

## See also

- [Workflow Policy](workflow-policy.md) — how turns are classified and gated
- [Architecture](architecture.md) — the control-plane architecture this standard protects
- [Skill Candidates](skill-candidates.md) — where new capabilities enter the catalog

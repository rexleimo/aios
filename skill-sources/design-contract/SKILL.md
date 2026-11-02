---
name: design-contract
description: Create or verify a project's DESIGN.md and MOTION.md instead of assuming one exists. Use when a project has no design or motion contract, when a contract may have drifted from the rules it claims to follow, or when you need to know which rules are actually enforced here. Runs a generator that measures the project and a checker that refuses unanswered decisions.
license: Complete terms in LICENSE.txt

installCatalogName: design-contract
clients: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, frontend, design, motion, contract]
repoTargets: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
---

A design contract that nobody generated is a document copied from someone else's
project. This skill replaces that with two commands: one measures the project, the
other refuses to accept a contract that still contains an unanswered decision.

## When to use it

- A UI task is starting and the project has no `MOTION.md` (or has one that
  predates the current code).
- You suspect a contract drifted: rules deleted, rules reworded, a scope naming
  directories that no longer exist.
- You need to know which of the rules are actually enforced by something
  executable, rather than stated in prose.

## The loop

**1. Measure before writing.**

```bash
node scripts/design.mjs facts --root . --json
```

This reports what exists: the UI source files, the framework, the durations and
easings already in use, and which files animate without a
`prefers-reduced-motion` block. Read the `unknown` array first. If it is not
empty, the project has not been measured — files may exist but never have been
`git add`ed, or there may be no UI sources at all. **Do not write a contract from
an unmeasured project**, and do not report "0 surfaces" as a finding: it means
nothing was looked at.

**2. Generate the skeleton.**

```bash
node scripts/design.mjs init --root .          # writes MOTION.md
node scripts/design.mjs init --root . --force  # discards the existing decisions
```

The result is complete as a structure and deliberately incomplete as a decision:
it ends with `TODO(decision)` markers. That is the contract's honest state, not a
bug. Read the generated `适用范围` section — it lists files the generator actually
saw, so a wrong scope there is a measurement problem, not a prose problem.

**3. Answer the decisions.** This is the only part you write, and it is the part
that cannot be generated: which curves this product uses and why, which surfaces
may use placeholder bars, which trees are excluded and on what grounds. Each
answer takes the form *decision + reason + the option rejected*. Replacing a
marker with a decision is not the same as deleting the marker.

**4. Verify.**

```bash
node scripts/design.mjs check --root .
node scripts/check-design-contract.mjs --root .   # same judgement, older entry point
```

Three things are checked and all three must pass: every shared rule appears
verbatim, no local rule was silently added or removed without being recorded as a
decision, and no `TODO(decision)` remains. A rule you want to change belongs in
the shared set, not in your copy — a local edit forks the owner and
`check` will say so.

## What this does not do

- **It does not write the visual language.** `DESIGN.md` (palette, type, spacing)
  comes from `awesome-design-md` or from the project's own decisions; the
  generator only measures the motion facts and the surfaces.
- **It does not make a contract enforced.** A rule is enforced when something
  executable checks it. The declaration gate and the frame gate cover a subset;
  the rest is judged by a person. Do not describe a contract as "enforced" when
  only the document exists.
- **It does not port another project's scope.** Generated scope names files in
  *this* project. If a template ever mentions a specific product, that is a bug
  in the template, not a suggestion to copy.

## Where the shared rules live

`config/design-contract/UNIVERSAL.md` in the AIOS installation.
It contains no project paths on purpose, so it can be shipped to any project.
Editing it changes the rules for every project that adopted them; that is the
point of a single owner, and it is why a project's own `MOTION.md` must not
rewrite the copied block.

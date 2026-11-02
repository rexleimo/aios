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
node scripts/design.mjs init --root .              # writes MOTION.md and DESIGN.md
node scripts/design.mjs init --root . --only design # only the visual contract
node scripts/design.mjs init --root . --force      # discards the existing decisions
```

Both contracts come from **one measurement**, so they cannot disagree about
which files are in scope. The result is complete as a structure and deliberately
incomplete as a decision: it carries `TODO(decision)` markers. That is the
contract's honest state, not a bug. Read the generated `适用范围` section — it
lists files the generator actually saw, so a wrong scope there is a measurement
problem, not a prose problem.

`DESIGN.md` additionally reports **contradictions between the evidence and the
rules** the project appears to follow: tokens that colours bypass, one motion
curve spread over eight durations, files with motion but no reduced-motion
block. Those are findings, not formatting. Each one is either fixed in the code
or removed from the rules — a rule the evidence disproves teaches readers to
ignore the document.

**3. Answer the decisions.** This is the only part you write, and it is the part
that cannot be generated: which curves this product uses and why, which surfaces
may use placeholder bars, which trees are excluded and on what grounds, which
accent colour carries which meaning. Each answer takes the form *decision +
reason + the option rejected*. Replacing a marker with a decision is not the same
as deleting the marker.

**4. Verify.**

```bash
node scripts/design.mjs check --root .              # both contracts
node scripts/design.mjs check --root . --only design
npm run check:design                                # same judgement, CI entry point
```

All of these must pass: every shared motion rule appears verbatim, no local rule
was silently added or removed without being recorded as a decision, every
required section exists (the design contract has its own list — it has no gate
command and no rule set to restate), and no `TODO(decision)` remains. A rule you
want to change belongs in the shared set, not in your copy — a local edit forks
the owner and `check` will say so.

With no `--only`, a contract that does not exist is not a failure: a document
that was never adopted makes no claim that could be wrong. `--only design` still
fails on absence, because there the absence contradicts the request.

## What this does not do

- **It does not invent the visual language.** The generator measures tokens,
themes, fonts, spacing roles and the count of colours that bypass those tokens;
it never picks a palette, because that is a brand decision nobody approved. The
structure comes from `config/design-contract/DESIGN-STRUCTURE.md`, the choices
from the project (`awesome-design-md` is one legitimate source for them).
- **It cannot see a colour written in JavaScript.** Hex literals in `.ts`/`.mjs`
are outside the scan; a theme built in code will read as "0 loose colours", which
is a measurement boundary, not a clean result.
- **It does not make a contract enforced.** A rule is enforced when something
  executable checks it. The declaration gate and the frame gate cover a subset;
  the rest is judged by a person. Do not describe a contract as "enforced" when
  only the document exists.
- **It does not port another project's scope.** Generated scope names files in
  *this* project. If a template ever mentions a specific product, that is a bug
  in the template, not a suggestion to copy.

## When the work needs the upstream material

A contract tells you what the rules are. It does not tell you how to draw a
window, a phone, a chart or a cursor demo — that material lives upstream and is
installed separately. Do not conclude "there is no kit" from the fact that this
installation ships only the criteria.

The criteria ship with AIOS (`vendor/stageshow/references/`, 15 documents) and are
verified by `node scripts/check-motion-kit.mjs`. The material — the React kit, 69
gold examples, the filming toolchain — is installed by one command:

```bash
aios skill add benjitaylor/skills --skill stageshow --yes
```

It lands in `${AIOS_HOME:-$HOME/.aios}/skills/external/stageshow/`, projected into
the global skills root of every client. Check for it there before assuming it is
absent; if it is absent and the task needs it, install it rather than handing the
user a URL.

Two consequences worth stating, because they decide whether this path applies at
all: the kit is React, and it is **copied into the host project** rather than
imported from the installation. A static CSS or vanilla-HTML project follows the
reference texts and builds the shape in its own CSS — that is the intended path
for it, not a degraded one.

## Where the shared rules live

`config/design-contract/UNIVERSAL.md` in the AIOS installation.
It contains no project paths on purpose, so it can be shipped to any project.
Editing it changes the rules for every project that adopted them; that is the
point of a single owner, and it is why a project's own `MOTION.md` must not
rewrite the copied block.

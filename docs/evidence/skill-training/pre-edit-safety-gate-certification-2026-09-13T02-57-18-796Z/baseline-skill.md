---
name: pre-edit-safety-gate
description: Prepare a safe, current, and maintainable code change before editing. Use before a cohesive code or workflow change to assess the request and existing structure, then choose a local change, reuse, extension, or necessary refactor with clear ownership. Do not use to block ordinary TDD or authorized refactors.

installCatalogName: pre-edit-safety-gate
clients: [codex, claude, gemini, opencode, hermes, workbuddy]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, safety, edit, architecture, maintainability, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, agents, workbuddy]
---

# Mutation Safety Preflight

Run this preflight before a cohesive code, workflow, or migration change. Its
purpose is to establish a current baseline and a maintainable design; it is not
a per-keystroke approval system.

## 1. Establish a Safe Baseline

1. Inspect the worktree with `git status --short`, the current branch, and its
   upstream before changing files.
2. When the worktree is clean and the branch has an upstream, run
   `git pull --ff-only` to obtain the latest code without creating a merge.
3. If the worktree is dirty, the branch has no upstream, or fast-forwarding
   fails, do not stash, reset, rebase, force-pull, or discard work. Record the
   condition and continue only within the known baseline when doing so is safe.
4. Update the CRG code graph before planning. Then use the graph to locate the
   relevant module, callers, dependencies, and existing tests. If CRG is not
   available, record that fact and use targeted `rg` searches plus local tests
   as the fallback.

## 2. Decide the Appropriate Change Shape

Plan before a cohesive edit batch, not before every file save. First state the
requested public behavior, its owning domain or layer, the relevant existing
modules, and the focused verification command. Then decide which shape is
supported by the evidence:

- **Local change.** Use when the existing module owns the behavior and can
  express the request without duplicating responsibility or leaking internals.
- **Extend or reuse.** Use an existing domain module, abstraction, utility, or
  adapter only when its purpose and contract match the new behavior.
- **Refactor or extract.** Treat a refactor as part of the authorized request
  when duplicate or closely related capabilities, unclear ownership, or tight
  coupling prevent a correct and maintainable implementation. State the
  affected boundary, compatibility expectation, and migration steps.

Do not treat "smallest change" or "reuse first" as reasons to preserve an
unsuitable design. The smallest maintainable change is the smallest complete
design that correctly supports the request and leaves responsibility clear.

## 3. Design for Reuse and Clear Ownership

Search for similar behavior before adding an implementation. Record the best
candidate and why it is reused, extended, refactored, or rejected. Existing
code is evidence to evaluate, not a requirement to force reuse.

- **Reuse first.** Search for an existing abstraction, utility, adapter, or
  domain module before adding another implementation of the same behavior. If
  the candidate's semantics do not fit, improve or replace the boundary rather
  than forcing the new behavior through it.
- **抽象 (abstract) at a real boundary.** Extract or reshape a shared abstraction when
  two or more callers or features share stable behavior, rules, or lifecycle.
  Put the common contract at the domain boundary and keep meaningful variation
  explicit. Do not create a speculative framework for a single local use.
- **封装 (encapsulate).** Keep implementation details behind a small, explicit
  interface. Put policy with the domain that owns it instead of leaking it to
  unrelated callers.
- **解耦 (decouple).** Depend on narrow contracts and explicit inputs. Avoid cyclic
  imports, hidden global state, and direct knowledge of another module's
  internals when a boundary or adapter is available.
- **目录归属 (directory ownership).** Place a file with its owning domain or layer, use
  the project's established naming convention, and do not create a vague
  catch-all directory. Co-locate narrowly related tests with their feature or
  use the repository's existing test layout. Prefer a domain-oriented folder
  over a generic helper bucket when the code has a clear business or technical
  owner.

Ordinary multi-file refactors, test additions, and TDD are authorized by the
current user request and Rex Command. They do not need renewed user approval.
Ask before expanding the requested scope, handling uncertain user-owned data,
performing an irreversible deletion, pushing with force, or carrying out a
production external action that was not already authorized.

## 4. Make and Verify the Batch

1. Make one cohesive implementation or refactor batch that matches the plan.
2. Review `git diff` for duplicate logic, misplaced ownership, leaked
   internals, forced reuse, and accidental scope expansion. Confirm that any
   shared abstraction has a real consumer and that files remain with their
   owning domain or layer.
3. Run the focused test after the batch. A Rex TDD RED failure that matches the
   test contract is valid evidence, not a blocker; distinguish it from an
   unexpected regression, a known baseline failure, or infrastructure failure.
4. Refresh CRG after a batch when source topology, dependencies, or public
   interfaces changed. Run broader verification at a meaningful milestone or
   before completion, rather than after every edit.

This skill supplies safety and design evidence only. It does not choose a Rex
Provider, select the next feature, or mark the work item complete.

## Fallback and Safety Boundaries

When CRG is unavailable, use the project instructions, targeted `rg` searches,
the target file and nearby examples, `git diff`, and focused tests. Do not
invent graph results.

Protect ownership boundaries: migrate or delete only targets proven to be
AIOS-managed within the approved scope. Stop for an unknown user-owned path or
an irreversible operation whose target has not been resolved.

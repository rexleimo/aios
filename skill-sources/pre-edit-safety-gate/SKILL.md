---
name: pre-edit-safety-gate
description: Prepare a safe, current, and maintainable code change before editing. Use before a cohesive code or workflow change to safely synchronize Git, refresh the CRG code graph, and plan reuse, abstraction, encapsulation, decoupling, and clear file ownership. Do not use to block ordinary TDD or authorized refactors.

installCatalogName: pre-edit-safety-gate
clients: [codex, claude, gemini, opencode, hermes]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [general, safety, edit, architecture, maintainability, essential]
repoTargets: [codex, claude, gemini, opencode, hermes, agents]
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

## 2. Plan the Smallest Maintainable Change

Plan before a cohesive edit batch, not before every file save. State the public
behavior, the owning module or directory, the existing code to reuse, and the
focused verification command.

- **Reuse first.** Search for an existing abstraction, utility, adapter, or
  domain module before adding another implementation of the same behavior.
- **抽象 (abstract) at a real boundary.** Extract a shared abstraction when two or
  more callers share a stable behavior; do not create speculative frameworks
  for a single local use.
- **封装 (encapsulate).** Keep implementation details behind a small, explicit
  interface. Put policy with the domain that owns it instead of leaking it to
  unrelated callers.
- **解耦 (decouple).** Depend on narrow contracts and explicit inputs. Avoid cyclic
  imports, hidden global state, and direct knowledge of another module's
  internals when a boundary or adapter is available.
- **目录归属 (directory ownership).** Place a file with its owning domain or layer,
  use the project's established naming convention, and do not create a vague
  catch-all directory. Co-locate narrowly related tests with their feature or
  use the repository's existing test layout.

Ordinary multi-file refactors, test additions, and TDD are authorized by the
current user request and Rex Command. They do not need renewed user approval.
Ask before expanding the requested scope, handling uncertain user-owned data,
performing an irreversible deletion, pushing with force, or carrying out a
production external action that was not already authorized.

## 3. Make and Verify the Batch

1. Make one cohesive implementation or refactor batch that matches the plan.
2. Review `git diff` for duplicate logic, misplaced ownership, leaked
   internals, and accidental scope expansion.
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

---
title: Rex Workflow Migration
description: Move from the retired Superpowers workflow to the Rex-only AIOS workflow safely.
---

# Rex Workflow Migration

`rex-harness` is the only default software-engineering workflow for new AIOS
installations and managed workflow projections. Superpowers is retired as an
AIOS installation component and workflow. The previous `/superpowers/` URL is
kept as this migration guide so existing links continue to explain the current
behavior rather than teaching a retired workflow.

## What changes

Rex owns the software-engineering control loop: Facts, Capability selection,
Workflow Activations, Commands, Evidence Contracts, and recovery state. AIOS
adds host routing, client projection, ContextDB, safety checks, team execution,
and long-running harness support around that Rex control plane.

New installs use Rex projections for Codex, Claude, Gemini, OpenCode, Hermes,
and Grok, plus the shared `.agents` projection where the client supports it.
There is no Superpowers TUI option or separate Superpowers workflow to enable.

## Safe upgrade behavior

Run a normal update as usual:

```bash
aios update
```

Normal updates install and reconcile the Rex-only workflow. A historical
Superpowers projection without AIOS ownership proof is preserved and reported
as a conflict. This fail-closed default prevents AIOS from deleting a
user-managed path simply because its name resembles a legacy projection.

## Explicit legacy cleanup

If you want AIOS to adopt and remove its precisely recognized legacy
Superpowers projections, preview the result first and then run the explicit
cleanup:

```bash
aios update --adopt-legacy-superpowers --dry-run
aios update --adopt-legacy-superpowers
```

The same opt-in is available for users who do not update with `aios update`:

```bash
aios init --all --adopt-legacy-superpowers
aios setup --adopt-legacy-superpowers
```

Explicit adoption covers recognized AIOS legacy links in Codex, Claude, Gemini,
OpenCode, Hermes, Grok, and the shared `.agents` projection. It does not
remove an unknown, modified, or unproven user-owned path. Resolve those
reported conflicts manually after confirming ownership.

## Verify the migration

```bash
aios doctor --native --verbose
```

The doctor output shows client projection and workflow diagnostics. For
source-based installations, also ensure the bundled `rex-harness` submodule is
available:

```bash
git submodule update --init --recursive -- rex-harness
```

## Related documentation

- [Workflow Policy](workflow-policy.md) - choose `direct`, `guarded`, or
  `planned` host routing around the current Rex Command.
- [Getting Started](getting-started.md) - install and initialize AIOS.
- [Changelog](changelog.md) - release-level migration notes.

# Rex-only Superpowers retirement review

## Scope and evidence

Reviewed the workflow-surface reconciliation implementation, its lifecycle
callers, the installer-facing entrypoint, the canonical router skill, and the
focused regression suites.

- Reconciliation ownership and retirement policy:
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`
- Lifecycle adapter and setup/update/init entrypoints:
  `scripts/lib/workflows/rex-workflow-surface-lifecycle.mjs`,
  `scripts/lib/lifecycle/setup.mjs`, `scripts/lib/lifecycle/update.mjs`, and
  `scripts/aios-init.mjs`
- Rex global projections for all clients:
  `scripts/lib/rex-harness/client-projection.mjs`
- Canonical router and generated Grok projection:
  `skill-sources/aios-workflow-router/SKILL.md` and
  `.grok/skills/aios-workflow-router/SKILL.md`

Focused evidence:

- `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
  passed: 20 tests.
- `rtk node --test scripts/tests/skills-source-tree.test.mjs
  scripts/tests/rex-client-projection.test.mjs
  scripts/tests/aios-lifecycle-plan.test.mjs` passed: 28 tests.
- `rtk node scripts/sync-skills.mjs --check` reported all generated surfaces
  reused with no drift.

## Standards review

No actionable standards findings remain in the reviewed scope.

- The reconciliation module owns the migration classifier, ledger handling,
  removal, and recovery move. Lifecycle callers depend only on its narrow
  report interface; they do not duplicate filesystem policy.
- A removable legacy projection must be an exact absolute symlink to the
  known Codex Superpowers source (or, for Claude only, the known historical
  plugin-cache shape), with an equal skill basename. Relative, foreign,
  missing-source, directory, corrupt-ledger, and changed-before-removal cases
  remain fail-closed.
- The historical shared router is removable only when its Superpowers routing
  signature is accompanied by either just `SKILL.md` or AIOS's exact
  `.aios-skill-install.json` ownership record. A standard metadata file plus
  any additional user file remains a conflict.
- Native client discovery now iterates the registered client homes, so the
  exact legacy source link is recognized for Codex, Claude, Gemini, OpenCode,
  Hermes, and Grok. Claude's plugin-cache compatibility rule remains isolated
  to Claude rather than becoming a broad destructive rule.
- The shared `.agents/skills` compatibility root also recognizes only exact
  absolute links whose basename and target both match a legacy source skill.
  This removes the old cross-client Superpowers aliases without adopting a
  relative or redirected user link.
- The old checkout is moved atomically under
  `~/.aios/workflow-surfaces/retired-superpowers/`; it is not deleted. Project
  history under `docs/superpowers/` is never part of the resolved target set.
- The router catalog explicitly targets Grok and its generated output carries
  the Rex capability-command guidance without a `superpowers:` activation.

## Specification review

The implementation satisfies the reviewed acceptance contract:

| Acceptance | Review result |
| --- | --- |
| Exact historical workflow entries converge without an opt-in flag. | Satisfied by the reconciliation entrypoint and the six-client filesystem regression. |
| Fresh setup, update, init, and standalone installer flows project Rex workflow skills. | Satisfied by lifecycle/init/installer callers and all-client Rex projection tests. |
| User-managed or ambiguous paths are not deleted. | Satisfied by exact-link, source, directory, ledger, consumer, and race checks in the reconciliation suite. |
| Grok has both Rex workflow and the AIOS Rex router guidance. | Satisfied by the Rex client projection test and the generated-router regression. |
| No Superpowers spec-commit workflow is emitted by the current router. | Satisfied by the canonical/generated router negative assertion. |

## Operational boundaries

- An ambiguous user-owned directory or unknown link is intentionally retained
  and reported as `legacy-workflow-conflict`; automatic removal is unsafe in
  that case. Exact AIOS historical links are removed automatically.
- A client session already open before reconciliation may have loaded its old
  skill index. Start a new Codex, Claude, Gemini, OpenCode, Hermes, or Grok
  session after the repair so it re-discovers the Rex-only surface.

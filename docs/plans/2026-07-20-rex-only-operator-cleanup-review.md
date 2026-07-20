# Rex-only operator cleanup standards and specification review

## Reviewed scope

- `scripts/lib/cli/parse-args/{init,top-level}.mjs`
- `scripts/lib/cli/dispatch.mjs`
- `scripts/aios-init.mjs`
- `scripts/lib/lifecycle/{options/defaults,setup,update}.mjs`
- `scripts/reconcile-rex-workflow-surface.mjs`
- User-facing command help and the retired
  `scripts/lib/components/superpowers/skills.mjs` helper

## Standards review

No blocking standards finding remains in the reviewed scope.

- The existing `prepareRexWorkflowSurface()` lifecycle adapter remains the
  single reconciliation boundary. The new option is a boolean input to that
  adapter rather than a second cleanup implementation.
- Defaults remain `false` in parsing and lifecycle normalization. This keeps
  historical or user-owned projections in the existing conflict path unless
  an operator explicitly adopts them.
- The standalone parser accepts only `--root`, `--dry-run`,
  `--adopt-legacy-superpowers`, and help. Unknown options now fail before any
  reconciliation is invoked.
- The deleted helper had no remaining production references in the targeted
  reference audit. Historical `docs/superpowers/**` content is untouched.
- Setup and update help now directs operators to the standalone reconciler's
  `--dry-run` preview, avoiding an implication that their full lifecycle
  commands are no-write previews.

## Specification review

The implementation satisfies the bounded cleanup specification:

- `init`, `setup`, and `update` expose and forward the explicit adoption
  option; absent input continues to forward `false`.
- The standalone command provides a package-manager-independent cleanup path,
  documents the safe `--dry-run` then adoption order, and rejects a typo with
  a nonzero exit.
- Filesystem reconciliation remains responsible for the ownership ledger,
  symlink identity checks, dry-run non-mutation, and multi-client discovery
  for Codex, Claude, Gemini, OpenCode, Hermes, and Grok.
- The focused public-boundary tests passed under
  `receipt:6f184b15-9752-491e-a59f-167d7c02bf14`.

## Review verdict

Pass for the implemented operator-cleanup slice. This review does not claim
the broader release gates (generated sync, script suite, client smoke, or
training evidence) have passed; those require separate execution evidence.

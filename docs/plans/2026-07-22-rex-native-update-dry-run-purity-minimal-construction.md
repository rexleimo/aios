# Native Update Dry-Run Purity Minimal Construction Decision

## Reuse Ladder

1. **Remove dry-run support:** Rejected. The CLI advertises `--dry-run`, and
   users rely on it before a global-client update.
2. **Reuse existing lifecycle planning:** Selected. `planUpdate()` already
   owns normalized update options and preview text; extend that option shape
   with `dryRun` and use it to select a plan-only execution path.
3. **Use existing component dry-run support:** Insufficient. Native sync and
   route-command sync do not accept dry-run, and update also performs workflow
   preparation before components run.
4. **Add a dependency:** Rejected. No new dependency is required.
5. **Pass dry-run through only to native sync:** Rejected. It would leave
   workflow preparation and future component paths able to mutate before the
   native call, violating the CLI-level dry-run promise.
6. **Minimal new construction:** Add one normalized boolean, include it in the
   command preview, and return a clear plan result at the start of `runUpdate()`
   before workflow preparation, self-update, or any component installer runs.

## Selected Behavior

`aios update --components native --dry-run` must not create, rewrite, or
timestamp `.hermes/.aios-native-sync.json` (or any other managed target). It
reports the selected component plan instead. Normal updates retain the existing
component execution path.

## Evidence

- The observed dry run changed only Hermes metadata `generatedAt` from
  `2026-07-22T11:45:12.449Z` to `2026-07-22T15:30:46.445Z`.
- `normalizeUpdateOptions()` currently omits `dryRun`.
- `runUpdate()` currently invokes `prepareRexWorkflowSurface({ fix: true })`
  and then `updateNativeEnhancements()` before any dry-run branch.

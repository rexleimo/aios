# Native Update Dry-Run Purity RED Observation

## Focused Command

Declared scenario:

`node --input-type=module -e "import { runUpdate } from './scripts/lib/lifecycle/update.mjs'; await runUpdate({ components: ['native'], dryRun: true }, { rootDir: process.cwd(), projectRoot: process.cwd(), io: { log() {} }, deps: { updateNativeEnhancements: async () => { throw new Error('native updater reached during dry-run'); } } });"`

Scenario receipt: `receipt:6e87e818-6a5f-4d38-98c6-4e54bd9c62c9`

Focused test command:

`node --test --test-name-pattern="dry-run" scripts/tests/aios-lifecycle-plan.test.mjs`

Focused test receipt: `receipt:42de45ad-263d-4022-b0c5-b6b97d47d125`

## Expected Behavior

`planUpdate({ components: ['native'], dryRun: true })` retains `dryRun` and
shows `--dry-run` in its preview. `runUpdate()` returns that plan and does not
enter any component updater.

## Observed RED

- `planUpdate retains dry-run in its preview` failed because
  `plan.options.dryRun` was `undefined` instead of `true`.
- `runUpdate dry-run returns its plan before component updates` failed because
  the native updater was called (`['native']`) instead of no component updater
  being called.

## Failure Classification

Both commands reproduce the intended behavior delta: update option
normalization discards `dryRun`, so the public lifecycle entry follows the live
native update path rather than returning a read-only preview. They are not
test-environment or syntax failures.

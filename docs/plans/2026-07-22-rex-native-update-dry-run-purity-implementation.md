# Native Update Dry-Run Purity Implementation

## Changed Ownership Areas

- `scripts/lib/lifecycle/options/defaults.mjs`: declares `dryRun: false` in
  the update option contract.
- `scripts/lib/lifecycle/update.mjs`: preserves dry-run during normalization,
  includes it in the preview, and returns before any workflow or component
  operation.
- `scripts/tests/aios-lifecycle-plan.test.mjs`: covers the public plan and
  lifecycle entry behavior.

## Minimal Behavior Change

`runUpdate()` now creates the update plan once. When `dryRun` is true it logs
that plan and returns it before dependency selection, workflow preparation,
self-update, or any component updater. Normal updates continue through the
existing live-update sequence unchanged.

## Focused Verification

`node --test --test-name-pattern="dry-run" scripts/tests/aios-lifecycle-plan.test.mjs`

Receipt: `receipt:3b6346b7-fa6c-4ea6-893a-6c87682bf68c` (exit 0).

The declared isolated lifecycle scenario also exits successfully without
reaching its throwing native-updater dependency:

`node --input-type=module -e "import { runUpdate } from './scripts/lib/lifecycle/update.mjs'; await runUpdate({ components: ['native'], dryRun: true }, { rootDir: process.cwd(), projectRoot: process.cwd(), io: { log() {} }, deps: { updateNativeEnhancements: async () => { throw new Error('native updater reached during dry-run'); } } });"`

Receipt: `receipt:5310b647-87e2-4e29-8ea3-bc55470f7875` (exit 0).

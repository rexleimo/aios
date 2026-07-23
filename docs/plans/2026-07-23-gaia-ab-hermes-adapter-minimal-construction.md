# GAIA A/B Hermes Adapter Minimal Construction

## Reuse Ladder

1. The Hermes invocation is necessary because the requested comparison pins
   Hermes to `deepseek-v4-pro`; it cannot be removed or substituted by Codex.
2. Reuse `buildGaiaClientInvocation` and its `buildTaskInput` helper. They
   already validate task controls and omit `task.expected`.
3. Node's standard language features are sufficient: a fixed argv array and
   `String(remainingSpendUsd)` need no utility.
4. No installed dependency is needed; this stage must not add a process
   runner or client SDK.
5. One `client === 'hermes'` branch keeps the model pin, one-shot option, and
   usage-path requirement local and testable.
6. A new module would duplicate the privacy boundary and make later launch
   policy harder to review.

## Minimal Option

Add a tested Hermes branch to the existing factory, require a non-empty
`usagePath`, and return only `{ executable, args, input }`. The future launch
layer remains responsible for spawning the command and reading the usage file.

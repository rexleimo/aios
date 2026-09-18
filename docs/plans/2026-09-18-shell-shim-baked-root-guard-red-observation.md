# Shell Shim Baked Root Guard — RED Observation

- Work item: `shell-shim-baked-root-guard`
- Date: 2026-09-18
- Stage: `software.testing.tdd` / `red`
- Test scope contract: `docs/plans/2026-09-18-shell-shim-baked-root-guard-test-scope.md`

## Exact command

```
node --test scripts/tests/aios-components.test.mjs
```

cwd: `E:\coding\harness-cli`
Receipt: `receipt:3ba8a913-6bf4-4edb-b4d2-5b9e5190d06f`
Exit status: `1`

## Input / precondition

Isolated temp `homeDir` containing one installed managed shim
`<homeDir>/.aios/bin/aios` with `_aios_root_baked='<homeDir>/removed-runtime-root'`
(a directory that does not exist). Doctor is called through its exported public
entry `doctorContextDbShell({ rcFile, platform: 'darwin', homeDir, env, io })`.

## Contract-expected user-observable result

Doctor output contains a `[warn]` line naming the managed shim path and its
unresolvable baked root (test scope contract B1).

## Actually observed user-observable result

The focused slice fails. Doctor never inspects the baked root; it reports the
stale shim as healthy:

```
[ok] native shim installed: <homeDir>\.aios\bin\aios
```

No line containing `baked root` is emitted (the only `[warn]` lines are the
unrelated rc-file/PATH/per-command-missing notices).

Assertion error:

```
✖ shell doctor warns when a managed shim baked root no longer resolves
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /\[warn\][^\n]*baked root/u.
```

Suite totals for the receipted run: `pass 38 / fail 1`.

## Failure classification

- Missing target behavior, not infrastructure: the test harness, fixture, and
  imports all work; only the not-yet-implemented doctor check is absent.
- Not a mock-only assertion: the assertion reads the doctor's user-visible
  `io.log` output produced by the real exported entry.
- Not a pre-existing pass: the same test failed identically before any product
  change (see `receipt:45712c32-d0ce-4b4f-93d0-386a882f4037`), and the file was
  green (36/36) before the slice was added.

## Why this exposes the incident

The 2026-09-18 incident shim
`_aios_root_baked='D:\Temp\aios-shell-runtime-root-4jX3tx'` produced exactly the
output above: `[ok] native shim installed`, no baked-root warning. That is why
the dead root survived a week of `aios doctor` runs.

## Next-step condition

GREEN may start only after this RED is accepted: implement the baked-root
resolution check in `doctorContextDbShell` without touching shim templates, then
re-run the same focused command and require exit `0`.

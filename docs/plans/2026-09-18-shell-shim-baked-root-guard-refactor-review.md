# Shell Shim Baked Root Guard — REFACTOR Review

- Work item: `shell-shim-baked-root-guard`
- Date: 2026-09-18
- Stage: `software.testing.tdd` / `refactor`
- Test scope contract: `docs/plans/2026-09-18-shell-shim-baked-root-guard-test-scope.md`
- GREEN diff: `docs/plans/2026-09-18-shell-shim-baked-root-guard-green-diff.md`

## Refactor check

Exact command:

```
node --test scripts/tests/aios-components.test.mjs
```

Receipt: `receipt:b5f14ee8-c9d3-4932-805b-c4a2ada78c95`
Exit status: `0` (suite unchanged at `pass 39 / fail 0`)

## Implementation decision: keep the GREEN implementation

No refactor applied. Reasons:

- `readShimBakedRoot` / `expandShimRoot` / `shimBakedRootResolves` are already
  single-purpose and are the only new duplication surface; there is no repeated
  block to extract.
- The obvious "simplification" — collapsing the four `expandShimRoot` replaces
  into one generic `\$\{?([A-Z_]+)\}?` substitution — would generalize behavior
  that no test currently pins (see coverage boundary below). Trading verified
  code for unverified generality at REFACTOR is a net risk increase, so the
  simple implementation is retained per the "no clear benefit, keep it simple"
  rule.

## Test diff review

`git diff --stat -- scripts/tests/aios-components.test.mjs`:

```
1 file changed, 91 insertions(+)
```

91 insertions, **0 deletions**. Review findings:

| Check | Result |
|---|---|
| Assertions deleted or skipped | none (0 deletions) |
| Assertions loosened or retargeted | none; the new `assert.match` / `assert.doesNotMatch` patterns are new, not replacements |
| Assertions count internal calls or private helpers | no; the fixtures call only the exported `doctorContextDbShell` and `installContextDbShell` |
| Assertion surface is user-observable | yes: captured `io.log` text for doctor, file content of the rewritten shim for setup |
| Fixtures isolated from the real machine | yes: `mkdtemp` `homeDir`, `rcFile` under that temp dir, `commandRunner` stubbed |
| Existing tests still cover their behaviors | yes: 36 pre-existing tests still pass unchanged |

The three added tests map 1:1 to the contract's B1/B2/B3 and are the only added
behavior constraints. Nothing in the diff relaxes an existing expectation.

## Coverage boundary (disclosed, not hidden)

`expandShimRoot`'s `${HOME}` branch is exercised by the real-machine observation
recorded in the GREEN diff (`C:\Users\Administrator\.aios\bin` all report `[ok]`,
stale count `0`), not by a unit test. The unit tests pin the literal-path form
(B1 stale, B2 live) and the setup repair form (B3). Adding a `${HOME}` unit test
would be a test change beyond the accepted GREEN cycle, so it is recorded here
as a known boundary rather than silently introduced.

## Next-step condition

No further TDD stage is required for this behavior: RED → GREEN → REFACTOR are
complete with a zero-exit refactor check. Proceed to the next Command supplied
by rex-harness for review/verification.

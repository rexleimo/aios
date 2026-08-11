# Test suite architecture refactor check

- Suite policy is centralized in `scripts/lib/test-suite-runner.mjs`.
- Legacy regression coverage is explicit in `scripts/test-suites.json`; no
  recursive discovery is used for regression.
- Unit discovery is limited to `scripts/tests/unit` and runs at concurrency 4.
- Assertions remain behavior-level; no tests were skipped or weakened.
- `git diff --check` is clean.
- Focused suite test passes: `node --test scripts/tests/unit/test-suite-runner.test.mjs`.

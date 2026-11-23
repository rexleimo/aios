# RED failure reason — Console UI i18n

- command: `node --test apps/shell/ui/tests/i18n-catalogs.test.mjs`
- receipt: `receipt:ddaad121-ff86-4e5d-9057-85bd31e5a636` (exit 1)

Observed failure: `ENOENT` while reading `apps/shell/ui/src/i18n/catalogs/zh-CN.json`.

Why this is the target behavior, not an infrastructure fault:
- The test fixture is fixed and the command is reproducible; no syntax/import error.
- The missing artifact is exactly the new public capability under test: Lingui locale catalogs for `zh-CN`, `en` and `ja`.
- Before this work item the Console has no `src/i18n/` module and no catalog files, so switching language is impossible.
- Expected post-GREEN behavior: all three catalogs exist with identical key sets and non-empty values; parity test passes.

Not a legal RED if: catalogs are added by weakening the assertion, or the test is skipped. Neither is done.

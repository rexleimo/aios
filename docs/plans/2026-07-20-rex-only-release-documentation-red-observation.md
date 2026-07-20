# Rex-only Release Documentation RED Observation

- Public entry: `docs-site/superpowers.md` through the public `/superpowers/`
  route.
- Test command: `node --test --test-name-pattern "public release documentation
  describes ownership-safe Rex-only migration"
  scripts/tests/release-pipeline.test.mjs`.
- Receipt: `receipt:75a837aa-5b96-4f55-8d37-abc3c47d14b1`.
- Exit status: `1`.

The focused public-artifact test failed at
`scripts/tests/release-pipeline.test.mjs:279` because the guide did not match
`/rex-harness is the only default software-engineering workflow/u`.

The observed guide still had the title `Superpowers` and the statement
`Superpowers are reusable process playbooks`. This is the expected RED: the
test is correctly detecting that the requested Rex-only migration documentation
has not been implemented yet, rather than an environment or fixture failure.

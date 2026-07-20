# Localized Rex Migration RED Observation

## Observed public failure

- The typed public scenario `receipt:b5ae0162-4e1e-444c-991c-0c226f1bb62a`
  exited with status `1` because the Chinese localized public route does not
  contain `rex-harness`.
- The newly extended focused release-documentation test
  `receipt:40d03340-4526-4378-9fca-13cb48497773` exited with status `1`.
- Its user-visible assertion failure is:
  `zh/superpowers.md is missing its Rex migration heading`.

This is a valid RED, not a test infrastructure failure. The test reads the
checked-in public Markdown route and reports that it still has the `#
Superpowers` catalog title and reusable-playbook introduction. The failure
matches the specified behavior delta: localized visitors are still shown a
retired workflow instead of the Rex-only migration guide.

# Deterministic Skill Resolution RED Observation

## Public Scenario

- Entry: `resolveCatalogEntries()` for the Codex global skill scope.
- Input: two existing canonical skill directories with the same installed name,
  `duplicate-provider`, but different source paths.
- Expected result: an actionable duplicate-name error before a caller can
  install or select either source.

## Execution

```text
node --input-type=module -e "... assert.throws(resolveCatalogEntries(...))"
```

Receipt: `receipt:fc97dae2-0445-485a-ae4b-94fe630cf3a2`

The scenario exited with status `1` because the assertion expecting an error
did not observe one.

## Failure Classification

This is a valid behavior RED, not a test-infrastructure failure. Both source
directories and the exported resolver are real checked-in public inputs. The
resolver filters and maps the entries in incoming order but does not group
duplicate client/scope/name target keys. The result can make a later write
silently determine the winning Provider skill. The GREEN implementation must
add deterministic conflict analysis, then retain this public scenario and add
fixture coverage for doctor reporting and stable valid ordering.

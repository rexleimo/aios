# Native Sync Token Discipline RED Observation

`receipt:b665526b-9636-46f7-ac25-51a04fd7090a` records:

```text
node --test scripts/tests/token-discipline.test.mjs
```

The command exits `1`; five tests pass and the native-sync integration case
fails. Its public assertion expects `AIOS Token Discipline` in the managed
native block, but the observed generated content is:

```text
<!-- AIOS NATIVE BEGIN -->
core-instructions partial
<!-- AIOS NATIVE END -->
```

The failure is aligned with the requested behavior: the normal native-sync
operation omits token guidance from its managed projection. It is not a test
fixture or execution-receipt failure.

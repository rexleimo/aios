# Native Guidance Token Contract Update Implementation

The production native composer is unchanged. The corrected public test now
asserts the compact contract already selected by the shared native projection:
the managed block has its markers and core instructions, but does not inject
`AIOS Token Discipline` or strategic-compaction detail into daily context.

This replaces a stale assertion that contradicted the pull-based native
guidance policy. It does not remove token-discipline configuration, sources, or
on-demand skills.

Verification:

- `receipt:06bd142d-a5ef-4e54-976b-e7d109ced1e2` passes all six
  token-discipline tests.
- `receipt:292c18d4-ef76-4d9b-a841-737ab79ca668` passes all native guidance
  projection tests.

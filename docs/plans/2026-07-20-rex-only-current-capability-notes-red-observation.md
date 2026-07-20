# Rex-only Current Capability Notes RED Observation

## Scenario

The public, unversioned `Docs And Workflow Notes` section must no longer list
Superpowers as a current AIOS capability. Versioned release history is outside
this assertion and remains historical evidence.

## Observed RED

- Typed public scenario: `receipt:2d7409dc-db35-4f1f-bd6d-7272ece45850`
  exited with status `1`.
- The focused public release documentation contract:
  `receipt:2ff6d6ef-bc0a-49a7-9c16-d9964e4e764a` exited with status `1`.
- The focused failure was: `AssertionError: changelog.md still advertises
  Superpowers as a current capability`.

The failure is a valid behavioral RED, not a fixture or environment failure:
the current Grok and Hermes capability summaries in the English, Chinese,
Japanese, and Korean public changelogs still include `superpowers`. The
Rex-only migration documentation introduced earlier did not update these
unversioned capability summaries.

## Planned Smallest GREEN Change

Update only the four unversioned current capability summaries, retaining their
remaining supported capabilities (`skills`, `agents` where applicable,
`native`, `team`, and `harness`) and leaving all versioned historical release
entries unchanged. The existing focused release-documentation test is the
public behavior seam for this change.

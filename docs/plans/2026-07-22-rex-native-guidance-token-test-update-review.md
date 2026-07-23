# Native Guidance Token Contract Invariant Review

## Invariants Reviewed

- Native sync still invokes the public renderer and writes a marked managed
  block in an isolated temporary root.
- The test positively requires the managed marker and shared core content; it
  does not pass merely because output is empty.
- The test negatively requires both the token-discipline heading and strategic
  compact detail to stay out of daily shared guidance.
- The existing native-guidance suite independently verifies the same compact,
  on-demand boundary for all supported clients.
- No production exporter, token configuration, or test-only API changed.

`git diff --check` passed. The focused token-discipline and native-guidance
receipts both exit zero: `receipt:06bd142d-a5ef-4e54-976b-e7d109ced1e2` and
`receipt:292c18d4-ef76-4d9b-a841-737ab79ca668`.

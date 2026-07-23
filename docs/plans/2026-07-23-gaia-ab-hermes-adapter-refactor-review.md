# GAIA A/B Hermes Adapter Refactor Review

No refactor was needed. The Hermes branch keeps the local usage-path invariant
at the same factory boundary as model pinning and shares the existing sanitized
task envelope. The test preserves the expected-answer sentinel and passes with
`receipt:81b9eedd-25e7-4012-be10-96b4f5bc888f` without starting Hermes.

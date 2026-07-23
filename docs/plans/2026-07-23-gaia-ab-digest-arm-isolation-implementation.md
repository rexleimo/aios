# GAIA Live A/B Digest and Arm-Isolation Implementation

## Implemented GREEN Slice

The execute path now requires the local task-manifest reader and verifies its
SHA-256 digest before browser preflight. A bad digest therefore rejects before
either the browser or client adapter is invoked.

The existing browser-preflight rejection test now supplies a valid temporary
task manifest through the same public seam. This keeps its original assertion
meaningful: once local integrity succeeds, a failed browser preflight still
causes zero task-client launches.

## Deliberate Boundary

This is only the integrity-first GREEN slice. No real browser, model, network,
dataset, leaderboard, credential, or production adapter was added. The
remaining per-arm failure-isolation rows remain in the approved test scope for
subsequent, separately evidenced slices.

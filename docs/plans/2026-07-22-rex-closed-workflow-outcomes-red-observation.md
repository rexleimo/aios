# Closed Workflow Outcome RED Observation

`receipt:7c4e6261-4301-4e94-8654-08de1a08d17b` ran the public long-running
delivery suite with no evidence submitted to an active feature. The test exits
1 because the result is `{ kind: 'blocked' }`, not the typed
`{ kind: 'blocked', reason: 'evidence-missing' }` contract.

The baseline and fixture are valid; the behavior failure is confined to the
public decision envelope lacking a machine-readable rejection reason.

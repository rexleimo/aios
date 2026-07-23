# Dependencies-Unresolved Blocking Implementation

Long-running delivery now distinguishes a terminal completion from a state
with remaining pending but non-ready features. In the latter case it accepts
the completed current feature, leaves pending features untouched, sets
`currentFeatureId` to `null`, marks the ledger `blocked`, and returns:

```js
{ kind: 'blocked', reason: 'dependencies-unresolved' }
```

Focused public verification passed with
`receipt:048d55d5-00d8-40a5-a777-e05026c686fe`; the existing no-dependency
delivery suite passed 5/5.

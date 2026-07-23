# Closed Workflow Outcome Implementation

The long-running delivery public evidence-rejection path now distinguishes
missing evidence from other blocked transitions. Submitting no valid evidence
returns:

```js
{ kind: 'blocked', reason: 'evidence-missing' }
```

The active feature and ledger state remain unchanged. The focused delivery
suite passed with `receipt:a4c2924f-911f-4dbb-bb79-b2ce988a0f08`; the adjacent
dependency contract suite passed 4/4.

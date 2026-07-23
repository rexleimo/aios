# Software Workflow Typed Blocking Implementation

`advanceSoftwareWorkflow()` now catches only errors from public
`validateCommandEvidence()` and returns an immutable fail-closed result:

```js
{
  outcome: 'blocked',
  blockedReason: 'evidence-invalid',
  workflow,
  completedActivation: null,
  missingEvidence: [],
  nextCapability: null,
}
```

Scenario-command derivation remains outside that catch, so corrupted legacy
testability workflow state continues to throw rather than being misclassified
as submitted evidence. The focused workflow runtime suite passed with
`receipt:fafd4aac-60a0-42f7-814f-6330a0bb1dc2`; long-running delivery coverage
remained 5/5.

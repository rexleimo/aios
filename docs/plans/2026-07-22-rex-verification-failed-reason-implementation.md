# Verification-Failed Reason Implementation

The existing retry-exhausted nonzero verification path still records the
receipt and returns a human gate, now with the stable public decision:

```js
{ kind: 'human-gate', reason: 'verification-failed' }
```

The retry branch before exhaustion is untouched. The focused suite passed with
`receipt:117cc3b5-ee1f-4807-90c3-4d9b36af29d6`; the adjacent dependency
contract suite passed 4/4.

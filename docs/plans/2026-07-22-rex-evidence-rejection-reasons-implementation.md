# Evidence Rejection Reasons Implementation

The wrong-feature evidence branch in long-running delivery now returns the
stable public result:

```js
{ kind: 'blocked', reason: 'evidence-feature-mismatch' }
```

It reuses the existing immutable terminal-decision helper and does not alter
valid receipt progression. The focused suite passed with
`receipt:988b470c-a208-4f53-a536-0d408c7a7822`; the dependency contract suite
also passed 4/4.

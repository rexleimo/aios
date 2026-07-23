# Receipt and Terminal Reasons Implementation

When a feature receipt cannot resolve, normalize, or match the declared
verification command, long-running delivery now returns:

```js
{ kind: 'blocked', reason: 'evidence-rejected' }
```

The existing receipt-validation boundary and immutable active ledger remain
unchanged. Focused delivery tests passed with
`receipt:8bf324c1-cead-403b-9f49-14fbc4928f90`; the dependency contract passed
4/4.

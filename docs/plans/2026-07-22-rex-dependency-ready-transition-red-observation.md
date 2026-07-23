# Dependency-Ready Transition RED Observation

The public `advanceLongRunningDelivery()` scenario records a dependent feature
before its prerequisite. After a matching zero-exit prerequisite receipt,
`receipt:d6ef0ee0-88b4-4da8-9e0b-fdb73c86059c` exits 1: the implementation
marks delivery completed rather than activating `dependent`.

This is a behavior failure, not fixture failure. The baseline and receipt are
valid; the earliest deviation is the current index-based next-feature lookup,
which excludes pending features declared before the completed prerequisite.

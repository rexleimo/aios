# Dependency-Ready Transition Implementation

After accepting the current feature, long-running delivery now builds the set
of accepted feature IDs (including that just-accepted feature) and selects the
first pending feature whose `dependsOn` values are all present. This preserves
declaration-order determinism while allowing a dependent declared before its
prerequisite to activate correctly.

The focused public contract passed with
`receipt:415c453f-5421-46ab-b27b-c0001a913d95`; the existing no-edge long
running delivery suite also passed 5/5.

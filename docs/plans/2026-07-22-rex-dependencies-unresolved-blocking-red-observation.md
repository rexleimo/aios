# Dependencies-Unresolved Blocking RED Observation

`receipt:466fc6ca-9ab1-4e6f-a0c2-255e72babaf9` records the public transition
where the active blocker passes, the only prerequisite is human-gated, and its
dependent is pending. The suite exits 1 because the transition completes the
ledger instead of returning the required typed blocked result.

The receipt, baseline, and blocker verification are valid. The failure is
confined to the absence of a pending-but-unresolved branch after ready-feature
selection; it is not an environment or fixture error.

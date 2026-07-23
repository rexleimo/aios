# Receipt and Terminal Reasons RED Observation

`receipt:3874bb71-80d4-47f8-94f9-7676fb755915` records a public delivery
transition with an active feature ID but a receipt from a different
verification command. Validation safely rejects the receipt; the test exits 1
only because the decision omits `reason: 'evidence-rejected'`.

This is a scoped observable behavior gap, not a receipt, command, or fixture
failure.

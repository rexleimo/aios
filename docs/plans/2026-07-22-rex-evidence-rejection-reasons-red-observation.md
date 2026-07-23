# Evidence Rejection Reasons RED Observation

`receipt:32e2594c-9274-41f8-a79f-67a412285e46` records a controlled public
delivery where a receipt is supplied for a pending feature other than the
active feature. The evidence is safely rejected, but the suite exits 1 because
the public result lacks `reason: 'evidence-feature-mismatch'`.

The receipt fixture and command are valid. The failure is solely the missing
typed reason in the wrong-feature rejection branch.

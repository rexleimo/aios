# Verification-Failed Reason RED Observation

`receipt:1325b821-29f1-42db-ab06-1485ad6cc95e` records two real nonzero
verification receipts with a retry budget of one. The first result remains a
retry as expected; the second reaches the existing human gate but the suite
exits 1 because that public decision lacks `reason: 'verification-failed'`.

The controlled command, receipt capture, and retry accounting are valid. The
only missing behavior is the terminal machine-readable reason.

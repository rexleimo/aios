# GAIA Live A/B Client Error and Reconciliation Hardening

## Hardened Public Boundaries

- A rejected first client call after a 2 USD estimate must produce only a
  whitelist `client_error` terminal artifact, retain 2 USD in the shared
  ledger, skip the failed job's second task, and allow the next job to receive
  8 USD.
- A successful first task with a 2 USD estimate and 0.5 USD actual spend must
  reconcile the shared ledger so the next job receives 9.5 USD.

## Scope Control

The hardening change is limited to public tests in the existing
`gaia-ab-live-runner` suite. It adds no product exports, adapters, packages,
or external I/O. The existing public runner remains the sole execution entry.

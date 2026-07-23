# Workflow Intelligence Diagnostic A/B Minimal Implementation

## Delivered behavior

`scripts/workflow-diagnostic-ab.mjs` is a public, local-only `--dry-run`
entry point. It validates a diagnostic configuration, verifies the SHA-256 of
the local task manifest, resolves the two approved committed `AGENTS.md`
sources with `git show`, and prints their distinct SHA-256 digests together
with the single-client control record.

The entry point accepts no execution mode and imports no client adapter. It
therefore cannot launch Codex, Claude, Hermes, a browser, a network tool, or a
GAIA request.

## Boundary ownership

- `scripts/workflow-diagnostic-ab.mjs` owns the public CLI and the narrow,
  argument-vector `git show` policy reader.
- `scripts/lib/workflow-diagnostic/manifest.mjs` owns strict configuration and
  task validation plus the offline summary construction.
- `scripts/tests/workflow-diagnostic-ab.test.mjs` exercises the public CLI via
  a temporary non-GAIA task/config pair; it does not mock the policy resolver.

## Fixed controls in this slice

The first executable slice permits only Codex `gpt-5.6-terra`, one worker, no
retry, and `no-browser-no-network-tools`. A positive timeout and positive
spend cap are required even in dry-run so a later execution boundary cannot
silently infer them. Both policy refs must be 40-character commit references
to exactly `AGENTS.md`; a changed, unavailable, identical, or malformed source
fails before a client boundary exists.

## Verification

`node --test scripts/tests/workflow-diagnostic-ab.test.mjs` exits zero under
`receipt:9d39ef15-c914-4a4c-83cb-ca74ddd84bc5`. The test proves that the public
entry produces a one-task summary and distinct policy digests. It does not
claim an intelligence score or a real model result.

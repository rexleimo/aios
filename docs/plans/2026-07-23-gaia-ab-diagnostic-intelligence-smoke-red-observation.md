# Workflow Intelligence Diagnostic A/B RED Observation

## Public behavior under test

`scripts/workflow-diagnostic-ab.mjs --dry-run --config <local-config>` must
validate a local diagnostic task manifest and lock the two committed workflow
policy sources before any client process can start.

## Input and command

The focused test creates a one-task local, non-GAIA manifest with the expected
answer held outside client input. Its configuration pins Codex to
`gpt-5.6-terra`, a 60-second timeout, no retry, concurrency one, no-browser/no-
network tools, and a one-USD cap. It names these two policy sources:

- `c3b9197853bfb93ec264b03a838162cca9a035c4:AGENTS.md`
- `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9:AGENTS.md`

Executed through the Rex receipt boundary:

```text
node --test scripts/tests/workflow-diagnostic-ab.test.mjs
```

Receipt: `receipt:c2f7747d-874b-4d4c-90c0-8d5e4f4808b7` (exit code 1).

## Expected observable result

The public CLI exits zero and emits a dry-run JSON summary containing the
single task, the fixed controls, and distinct SHA-256 policy digests. It does
not launch a model client.

## Actual observable result

Node fails before the assertion can parse a summary:

```text
Error: Cannot find module 'E:\\coding\\harness-cli\\scripts\\workflow-diagnostic-ab.mjs'
```

The focused test reports one failure and zero passes. No client process,
browser, network request, credential, or GAIA data is involved.

## Failure classification

This is a valid RED for the requested user-visible dry-run diagnostic entry
point. The failure is caused by the missing public CLI, rather than test
syntax, a temporary fixture, an environment dependency, or an unrelated
regression.

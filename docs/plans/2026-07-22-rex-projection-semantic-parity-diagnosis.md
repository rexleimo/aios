# Rex Projection Semantic Parity Diagnosis

## Reproduction

`receipt:0d70c862-0146-44f3-904e-9e9dcbfac9fe` invokes the public compact CLI
projection with a Rex blocked result containing
`blockedReason: 'evidence-invalid'`. The assertion fails because the returned
`rex.cli.workflow-command.v1` object omits that field.

## Root Cause

`rex-harness/src/cli/workflow-output.mjs` explicitly projects `outcome`,
status, IDs, command, and missing evidence but not `blockedReason`; this drops
the field for direct compact-projection callers. The end-to-end standalone CLI
has a second loss boundary: `presentStandaloneWorkflow()` recreates the core
result without forwarding `advanced.blockedReason`. It also reseals rejected
evidence with a new command token, which loses current-command identity even
though the core rejected result preserves it.

The standalone JS API returns the core result directly.
`advanceAiosSoftwareWorkflow()` spreads the core result and then binds only
`workflow.currentCommand.provider`, so it currently preserves Rex result
fields; this has no explicit parity regression test.

## Regression Checks

1. A CLI projection test must assert blockedReason, existing compact keys, and
   rejected-command identity through the real standalone CLI.
2. An AIOS adapter test must compare Rex-owned semantic fields for a blocked
   advance while allowing only the provider binding to differ.

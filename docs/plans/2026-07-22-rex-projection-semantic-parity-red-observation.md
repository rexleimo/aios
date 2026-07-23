# Rex Projection Semantic Parity RED Observation

## Command and Receipt

`receipt:f9cd29b5-9884-46ec-be61-bf94a24ffd2b` records the exact public
scenario command accepted in the testability decision:

```text
node --input-type=module -e "...presentCliWorkflow(result).blockedReason..."
```

The command exits `1`.

## Public Scenario

The compact CLI projection receives a blocked Rex result with
`blockedReason: 'evidence-invalid'`. It should retain that reason together with
the established status, workflow identity, command, and missing-evidence
fields. The new standalone CLI integration test exercises the equivalent
workflow path with a real wrong-scenario receipt; it is a supplemental
regression check, rather than the scenario-bound RED receipt.

## Observed Failure

The focused test fails at:

```text
Expected values to be strictly equal:
+ actual - expected
+ undefined
- 'evidence-invalid'
```

The failure is the diagnosed behavior gap: `presentCliWorkflow()` omits
`blockedReason`. The equivalent standalone CLI integration test also reaches
this assertion after valid setup and receipt validation, so the RED does not
originate from the temporary workflow or the evidence boundary.

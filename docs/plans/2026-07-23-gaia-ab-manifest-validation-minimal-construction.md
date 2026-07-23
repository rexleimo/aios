# GAIA A/B Manifest Validation Minimal Construction Decision

## Reuse Ladder

1. **Remove accidental complexity:** not viable. A manifest is required to
   reproduce and compare the two context-policy arms without silently changing
   a client, model, task selection, tool environment, or execution control.
2. **Reuse existing repository code:** reuse `createCliParser` from
   `src/shared/cli-parser.mjs` for the public CLI. No existing GAIA manifest
   validator or GAIA score/report module exists. The RL task-manifest validator
   is domain-specific and enforces unrelated task fields, so extending it would
   couple GAIA evaluation to the RL-shell domain.
3. **Use the platform:** use Node's `node:fs/promises` and `JSON.parse` to read
   a JSON manifest. This is sufficient for the offline configuration slice.
4. **Use installed dependencies:** no additional package is needed. Commander
   remains behind the already shared CLI parser; YAML support is unnecessary
   because the reproducible manifest format is JSON.
5. **Use a local expression:** insufficient. Pairing and safety constraints
   need named, independently testable validation rules rather than a growing
   conditional block in the CLI entry point.
6. **Minimal new structure:** add a small pure
   `scripts/lib/gaia-ab-eval/manifest.mjs` module, call it from
   `scripts/gaia-ab-eval.mjs`, and cover it through the public CLI test.

## Selected Manifest Contract

The JSON manifest will contain one independent run record each for `codex`,
`claude`, and `hermes`. Every record provides a non-empty runtime `model` and
two arms, `baseline` and `optimized`. The arm controls must be identical for
`taskSet`, `toolProfile`, `browserProfile`, `timeoutSeconds`, `retryPolicy`,
and `concurrency`.

`hermes.model` must equal `deepseek-v4-pro`. Codex and Claude model identifiers
are required non-empty values now and must be replaced with the exact runtime
identifiers before any future live mode can start. The manifest has an explicit
`aggregateAcrossModels: false` report policy; any attempt to enable a combined
cross-model score is rejected.

## Deliberate Boundaries

This slice validates and prints an offline manifest summary only. It does not
download GAIA, score an answer, invoke a client, accept credentials, launch a
browser, or produce a leaderboard submission. Those behaviors need separate
test scopes and explicit live-run authorization.

## Focused Verification

Add public CLI tests for a valid three-client dry-run manifest and rejection of
Hermes model drift, unmatched A/B controls, and cross-model aggregation. Add
that test file to the explicit `test:scripts` list so the normal repository
script includes it.

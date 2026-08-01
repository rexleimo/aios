# Workflow Iteration v1 Baseline Repair

## Scope

Restore a trustworthy pre-feature baseline for the July workflow iteration without changing Rex production behavior.

In scope:

- make the Provider stop-boundary source test semantic rather than tied to one Chinese phrase;
- make the Rex Skill source test independent of the caller's current working directory;
- make the standalone projection argument assertion compare the platform-normalized path.

Out of scope:

- Fact, Capability, Provider, workflow, Evidence, or projection installation behavior;
- generated client Skill copies;
- the existing untracked `agent-sources/skills/` comparison source.

## Initial Observation

Environment:

- Node.js `v24.16.0`
- npm `11.13.0`
- parent baseline `23d07d53bb3a8f6be8cba807a49425994340a67c`
- rex-harness baseline `92af46c9d1b609cf8fdcdeeb2c1fcba11d61b398`

Observed failures before the repair:

1. `npm --prefix rex-harness test` passed 108 of 109 tests. The source contract accepted only the phrase `不要...下一个 Provider`, while `rex-implement` expresses the same boundary as not selecting the next Capability and not creating a second workflow.
2. The parent projection argument test expected the literal POSIX path `/tmp/aios` even though the parser intentionally returns `path.resolve()` output.
3. Running the focused source contract from the repository root resolved `skill-sources/` against the caller CWD rather than the rex-harness package root.

Rex RED receipt: `receipt:79c1d3d5-689e-4e4c-9744-b6978cb4af1e`.

## Minimal Changes

- `rex-harness/tests/skills/skill-sources.test.mjs`
  - resolve the package root from `import.meta.url`;
  - accept an explicit next-Provider, next-Capability, or stop-and-wait boundary;
  - retain stronger `rex-implement` checks for its self-check gate and second-workflow prohibition.
- `scripts/tests/rex-harness-adapter.test.mjs`
  - mirror the same semantic source contract at the AIOS adapter boundary.
- `scripts/tests/rex-client-projection.test.mjs`
  - compare `rootDir` with `path.resolve('/tmp/aios')`.

No production source file changed in this slice.

## Verification

Focused scenario, using the same command as RED:

```text
node --test rex-harness/tests/skills/skill-sources.test.mjs scripts/tests/rex-client-projection.test.mjs scripts/tests/rex-harness-adapter.test.mjs
```

Result: 21 tests passed, 0 failed.

Rex GREEN receipt: `receipt:9f19e697-3207-45eb-909a-ff58722699a5`.

Full Rex suite:

```text
npm --prefix rex-harness test
```

Result: 109 tests passed, 0 failed.

Doctor:

```text
npm --prefix rex-harness run doctor
```

Result: `status=ready`, 13 capabilities, no missing Provider instructions.

## Standards and Specification Review

- The diff does not remove any Evidence, activation, Provider, or stop-boundary assertion.
- The new alternatives express the same invariant at the Capability/Command level and add `rex-implement`-specific checks.
- CWD-independent test roots make the public test command reproducible from both the package and parent repository.
- Platform-neutral path comparison tests the parser contract rather than a host-specific string.
- No generated projection or user-owned comparison source was modified.

Verdict: pass.

## P-1B Managed Projection Safety

Implemented and verified:

- `rex-harness/src/clients/projection-manifest.mjs`
  - deterministic payload digest with LF normalization;
  - strict marker/history schemas;
  - `lstat` no-follow checks for roots, markers, and nested entries;
  - atomic marker creation through a same-directory temporary file and hard link.
- `rex-harness/src/clients/install.mjs`
  - complete source/history/target preflight before writes;
  - history-only authorization for destructive updates;
  - explicit `installed`, `updated`, `migrated`, `adopted`, `skipped`, `conflicts`, `errors`, and `recoveries` results;
  - staging-time target revalidation;
  - preserved recovery artifacts outside the client discovery root;
  - relative target roots resolved from `rootDir` and source-root overlap rejected.
- `scripts/lib/rex-harness/client-projection.mjs`
  - parent aggregation for migration, errors, and recovery records;
  - update/adopt/migrate no longer report as unchanged.
- `rex-harness/src/clients/projection-history.json`
  - current canonical digests plus verified historical digests from Rex commits `98b89b2` and `6198268`.

Contract coverage includes forged markers, junction targets, preflight missing sources, staging-time target creation/modification, migration classification, recovery records, and CRLF/LF parity.

Projection contract result: 35 tests passed, 0 failed.
Parent projection result: 7 tests passed, 0 failed.
Parent adapter result: 11 tests passed, 0 failed.
Rex package result: 121 tests passed, 0 failed.
Managed projection GREEN receipt: `receipt:08ee4ea4-35a1-4d5f-bdcf-239c9799371a`.

## Integration Fixture Isolation

`test:rex-integration` initially failed before its intended assertion because the repository contains a pre-existing untracked `agent-sources/skills/` directory. The test now copies only `agent-sources/manifest.json` and `agent-sources/roles/` into a temporary `aiosRoot`; production `loadCanonicalAgents()` remains strict and unchanged.

Integration result: 31 tests passed, 0 failed.
Integration GREEN receipt: `receipt:0f3b669f-0604-4c5d-abdd-0f8e5ed5cf0b`.

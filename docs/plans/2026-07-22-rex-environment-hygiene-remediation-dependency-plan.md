# Environment Hygiene Remediation Dependency Plan

## Objective

Resolve actionable local-environment diagnostics without deleting or silently
overwriting user-owned client configuration. Keep ordinary client guidance
compact and preserve the current RTK/Caveman-based token model.

## Confirmed State

- Browser setup and its dry run fail before mutation because no valid
  `ai-browser-book/mcp-browser-use` checkout exists at either supported default
  location. The checked-in `.mcp.json` points `AIOS_BROWSER_USE_REPO` at the
  same missing `E:\coding\ai-browser-book` path.
- A native update dry run reuses current managed native files. The native
  doctor auto-fix dry run reports no actionable native issue.
- The legacy Superpowers projections are reported as unproven because their
  ownership-ledger sources are unavailable. They are therefore user-owned or
  ownership-ambiguous and must not be removed by an automated remediation.
- The token doctor aggregates 17 configured MCP servers across project and
  client configuration files. It also flags `mcp-browser-use` for not using the
  retired AIOS proxy path, even though current repository policy states that
  RTK/Caveman are the token-compression runtime and no proxy routing is needed.

## Dependency Graph

```text
Authoritative browser-use checkout path or URL
  -> B. Provision browser-use runtime
  -> C. Validate browser MCP configuration and smoke path

A. Correct token/doctor diagnostics and regression coverage
  -> D. Re-run aggregate doctor and reconcile route-command report

Explicit approval to remove or archive ownership-ambiguous legacy projections
  -> E. Optional legacy projection cleanup
```

`A` can proceed independently of `B` and `E`. `B` cannot start until an
authoritative external checkout path or repository URL is available. `E` is
intentionally blocked rather than inferred from a warning.

## Execution Steps

### A. Correct actionable diagnostics in repository code

**Input:** The aggregate doctor currently counts independent client/project MCP
surfaces together and uses obsolete proxy-routing criteria for
`mcp-browser-use`.

**Action:** Add focused regression coverage, then update the token-discipline
diagnostic to report per-client budget evidence and to treat the configured
primary browser MCP as supported without the retired proxy wrapper. Reconcile
the aggregate/native doctor disagreement on route-command drift so that it
either produces a concrete managed repair or does not report a false drift.

**Done when:** The focused doctor tests prove the corrected classification;
the aggregate doctor no longer recommends disabling the required browser MCP
solely for proxy routing; and a reported route-command drift has an actionable
repair with a matching dry run.

**Verification:** Relevant `scripts/tests/*doctor*.test.mjs` and
`token-discipline.test.mjs`, followed by `npm run test:scripts` and
`node scripts/aios.mjs doctor`.

**Rollback:** Revert only the bounded diagnostic/test changes; no user-home
configuration is changed by this step.

### B. Provision the browser-use runtime

**Input:** A valid, user-authorized `ai-browser-book` checkout containing
`mcp-browser-use/pyproject.toml`.

**Action:** Set or correct `AIOS_BROWSER_USE_REPO` only after validating that
path, then run `node scripts/aios.mjs internal browser install` to create or
reuse its local runtime and migrate only managed browser MCP entries.

**Done when:** `internal browser doctor` finds the external project and its
runtime, and the generated MCP configuration resolves the launcher path.

**Verification:** Browser install, `node scripts/aios.mjs internal browser
doctor`, then a CDP launch/connect/navigate/screenshot/close smoke test.

**Rollback:** Restore the previous environment variable/config entry and leave
the external checkout intact; do not delete its virtual environment without
explicit approval.

### C. Validate browser MCP end to end

**Depends on:** B.

**Action:** Run the normal browser MCP smoke path against the default profile
after the runtime is healthy.

**Done when:** The primary `mcp-browser-use` server starts and completes the
documented CDP smoke sequence without exposing credentials.

**Verification:** `chrome.launch_cdp` -> `browser.connect_cdp` -> `page.goto`
-> `page.screenshot` -> `browser.close`.

**Rollback:** Stop the launched CDP session; no profile credentials are copied
or committed.

### D. Reconcile managed client projections

**Depends on:** A for the aggregate-doctor result; otherwise independent of B.

**Action:** Use the native doctor repair route only when it reports an
actionable managed file, and use the lifecycle updater only after a dry-run
shows the exact managed replacements.

**Done when:** Managed native projections and route commands pass their doctor
without hiding user-owned files or producing unexplained drift.

**Verification:** `internal native doctor --client all`, native sync tests,
and the aggregate doctor.

**Rollback:** Use the native rollback metadata for managed repairs; do not
replace unrelated user command files.

### E. Handle legacy Superpowers projections only with explicit ownership

**Blocked input:** The dry run reports `ownership-ledger-source-is-unavailable`
for every legacy projection, so no automated tool can prove ownership.

**Action after approval:** Archive or remove only the explicitly named legacy
projections, then rerun global client doctors. The default action remains to
retain them.

**Done when:** The user has selected a reversible cleanup policy and the
remaining projections have a verified owner.

**Verification:** `aios init --adopt-legacy-superpowers --dry-run` before any
mutation, followed by the affected client doctor.

**Rollback:** Restore the archived projection from the recorded backup path.

## Critical Path and Current Blockers

The repository-code diagnostic correction in A is the shortest unblocked path.
The browser/runtime repair is blocked on a trusted external checkout location
or source URL. Legacy projection removal is blocked on an explicit user choice
because the files are not proven AIOS-managed.

# Debug Hub Global Runtime and Hooks Release Plan

## Objective

Publish `v5.0.4` so a fresh AIOS installation can start the bundled
`debug-hub` MCP server without depending on the source checkout, and so
AIOS hook generation/migration does not retain stale absolute paths.

## Scope and dependency graph

```text
P1 baseline and contracts
  -> P2 package/build release integration
  -> P3 debug-hub startup compatibility and focused tests
  -> P4 hook path migration regression coverage
  -> P5 cross-platform packaging/install verification
  -> P6 version/changelog and release preflight
  -> P7 commit, push, tag, GitHub release, remote verification
```

P2 and P3 share the bundled runtime contract and must be reviewed together;
P4 is logically independent after the baseline; P5 depends on both runtime
and hook behavior; release actions are gated by all verification evidence.

## Work items

| ID | Result | Completion condition | Verification |
| --- | --- | --- | --- |
| P1 | Record current package, installer, archive, hook, and port contracts | Existing paths and test seams are identified in this plan | `git status --short --branch`; targeted source/test review |
| P2 | Bundle a runnable `packages/debug-hub` artifact in release archives and installer runtime | Unix and PowerShell release paths include built JS plus `ui.html` and required package metadata/dependencies | `bash scripts/package-release.sh --out dist/release`; archive content assertions; package typecheck/build |
| P3 | Make repeated MCP startup on the configured HTTP port fail diagnostically or reuse the existing service without breaking stdio initialization | A second debug-hub process cannot emit a misleading closed initialize response; focused tests cover startup/port behavior | `cd packages/debug-hub && npm run typecheck && npm test`; targeted startup smoke |
| P4 | Preserve correct global/project hook ownership and migrate stale absolute hook paths | Generated hooks resolve from the active AIOS root/workspace and legacy paths are rewritten or rejected with a regression test | `npm run test:scripts`; focused hooks test |
| P5 | Verify fresh archive installation on supported Unix/Windows packaging paths | Release archive has runnable debug-hub entrypoint and no source-checkout-only command remains in shipped docs/config templates | `bash scripts/release-preflight.sh --tag v5.0.4`; package/archive inspection |
| P6 | Apply patch version and release notes | `VERSION` is `5.0.4`, changelog documents the fix, and all required checks pass | `npm run test:scripts`; MCP typecheck/test/build; verification-loop verdict |
| P7 | Publish immutable release | Commit is pushed, tag `v5.0.4` points at it, and GitHub release assets are available | `git ls-remote`; `gh release view v5.0.4` |

## Failure and rollback boundaries

- Do not modify generated `mcp-server/dist/` or user-owned project settings.
- If a required release check fails, stop before version/tag/release actions and
  retain the failing command and first actionable error.
- Never force-push or rewrite an existing tag. If `v5.0.4` already exists,
  inspect it and stop for user direction rather than replacing it.
- Archive staging must be temporary and disposable; repository source and
  release metadata remain recoverable through Git until the final push.

## Release evidence

The release gate must include exact command results for package tests/build,
root script tests, release preflight, archive inspection, version/changelog
diff, commit/push, and remote tag/release verification.

## Test scope contract

### User goal

After installing an AIOS release, the configured `debug-hub` MCP client must
start from the installed runtime, complete MCP initialization, and expose its
HTTP API on the configured debug port. AIOS hook commands must resolve to the
active global runtime and workspace rather than stale absolute paths.

### Explicit non-goals

- Do not modify generated `mcp-server/dist/` output.
- Do not rewrite or commit a user's project-local Claude/Codex settings.
- Do not change debug-hub's log or evidence data model.
- Do not make the HTTP API dynamically select a random port unless the shipped
  client/reporter contract is updated and tested together.

### In-scope observable behavior

| Acceptance behavior | Observable assertion | Smallest stable entry point |
| --- | --- | --- |
| Release contains a source-independent debug-hub runtime | Extracted archive contains `packages/debug-hub/dist/cli.js`, its package metadata/dependencies, and `dist/ui.html`; the entrypoint can be invoked from the extracted runtime | `scripts/package-release.sh` archive fixture |
| MCP startup is not masked by a second HTTP bind | A second configured instance either reuses the existing HTTP service or exits with an explicit actionable port error; it must not silently close before initialize | `packages/debug-hub/src/server.ts`/CLI integration test |
| Hooks use current ownership paths | Generated hook commands contain the current AIOS root/workspace and no stale absolute path; a legacy config is migrated through the public init path | `scripts/lib/aios-init/hooks.mjs` public helper/fixture |
| Existing debug-hub behavior remains intact | Existing API, MCP handler, storage, and event tests remain green | `packages/debug-hub` test suite |

### Allowed test seams

- Add focused tests under `packages/debug-hub/tests/` for the public server
  startup contract.
- Add or extend the existing root script test fixture that exercises AIOS init
  hook generation/migration.
- Add release archive assertions to the existing release/preflight test seam;
  do not use a real global installation or user-owned configuration as a test
  fixture.

### Completion criterion

The focused tests independently fail against the pre-fix runtime/package
contract, pass after implementation, and the existing root, MCP, packaging,
and preflight suites pass without removing assertions, skipping cases, or
testing only mocks.

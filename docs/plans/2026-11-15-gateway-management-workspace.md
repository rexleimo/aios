# Gateway management workspace

## Accepted decisions

- Continue from the user's uncommitted gateway iteration; preserve unrelated work.
- Use the existing Console visual tokens and a task-oriented workspace: overview,
  providers/models, routing policy, and request history.
- Overview owns process control and client connection. Configuration shares one
  draft and one explicit save/discard boundary. Request history remains read-only.
- Keep `/routing/config` as a deep link to routing policy and redirect `/gateway`
  into the Console instead of maintaining a second application shell.
- Do not present explanatory privacy text as a working settings screen. Do not
  infer gateway health from historical traffic or connection from installed files.

## Scope and verification

- type: implementation
- targets: shell gateway components, configuration adapter, navigation, tests
- allowedWrites: `apps/shell/`, model-router provider/registry/discovery/connect logic,
  focused shell/model-router tests and their suite registration, this plan
- failureClass: configuration-loss / misleading-status / interface-usability
- Reuse `GatewayControl`, shared UI primitives, config API, decision-log API, and
  registry validation. Extract only shared draft and decision lifecycles.
- Fix routing-group persistence and protect unsupported registry metadata.
- Verify with TypeScript, focused shell/config tests, production build, real
  browser checks (desktop, 390px, reduced motion), and both motion gates.
- Browser mutation tests must use intercepted APIs or isolated temporary roots;
  never modify real client settings or make paid model calls.

## Rejected options and tradeoffs

- Rejected a long settings page: runtime operations and policy editing compete
  for attention and make it harder to understand what is actually saved.
- Rejected independent config hooks per tab: full-document writes create stale
  copies and switching tabs can silently discard work.
- Rejected adding usage/cost or privacy toggles without backing facts/APIs.
- Drafts survive task switches; document navigation warns before leaving dirty
  edits. External conflicts require an explicit reload/discard, not blind retry.

## Execution

### Provider-owned model workspace revision

- Accepted direction: the user selected the provider workspace and clarified that
  models are a child collection managed by their provider, not a parallel catalog.
- Reuse this work item. The UI owns selection, grouping and presentation. Limit
  adapter changes to management projection and deletion validation; preserve the
  shared draft, save/reload boundary, write locks, runtime and CLI behavior.
- Replace the stacked provider inventory and global model table with a master/detail
  workspace. Desktop uses a provider rail; mobile uses a compact provider selector.
  The selected provider owns its model search, source filter and add/edit actions.
- Creation inherits the selected provider and a compatible default protocol. Existing
  custom models can be explicitly reassigned without changing their local identity.
  Legacy unassigned custom models remain visible in a separate needs-binding view.
- Keep global discovery explicitly global: it refreshes all saved providers after
  confirmation, never the unsaved selection. Do not imply a provider-scoped backend
  operation or credential/generation verification that does not exist.
- Collapse credential/account details in the summary. Group the provider editor,
  retaining account order, inheritance, metadata and endpoint authorization checks.
- Rejected: two peer-level inventories; a separate all-models primary view; an
  overflowing mobile table; backend/CLI changes just to support this layout.
- No unresolved product decision remains. Existing dirty work is preserved, no pull,
  commit or push; CRG is unavailable, so targeted reads and browser tests own impact
  evidence. Baseline hashes: `/tmp/aios-provider-workspace-baseline.json` (5137 files).

Test scope contract / acceptance mapping:

- Public seam: real token-gated Console with intercepted configuration APIs; actual
  React components and production CSS, not mocked render output.
- Select either provider -> only its child models appear; counts include disabled
  definitions without presenting them as runtime-ready. Search and source filters
  remain within the selected provider and reset when switching parent.
- Add a model under a non-first, non-OpenAI provider -> parent and compatible
  protocol are prefilled; no write or discovery occurs before explicit confirmation.
- New provider becomes selected; reassignment moves the model between collections;
  referenced-provider removal is rejected and empty-provider removal selects safely.
- Unassigned legacy custom entries remain inspectable/editable without being silently
  rebound, discarded, or offered as callable models.
- At 1440px/390px and light/dark/reduced-motion, model content has no horizontal
  scroll dependency; short-screen dialog/save actions remain reachable by keyboard.
- Retain existing shared-draft, failed-save/409, reload/discard, account precedence,
  endpoint authorization and discovery-confirmation assertions. Adapt table selectors
  to semantic child lists, never remove behavioral assertions to get a pass.
- Out of scope: runtime routing, real client settings, paid requests, port 3126,
  known full-regression failures and the blocked standards export.
- Pre-change baseline: provider contract, explicit config and overview layout tests
  pass 40/40, zero skipped (`node --test` on those three existing files).

- [x] Add a failing provider-child browser regression.
- [x] Implement provider selection, scoped model collections and contextual creation.
- [x] Refine provider summary/editor hierarchy without changing safety semantics.
- [x] Verify focused tests, real browser layouts, typecheck/build and production frames.
- [x] Run final regression and record exact results and any known boundary.

#### Provider-owned workspace evidence (2026-11-16)

Desktop now uses provider navigation and a detail pane; mobile uses a compact
selector and vertical model lists. Search and source filters apply only to the
selected parent's children. New models inherit that provider and a compatible
protocol; explicit reassignment preserves an existing model's local route ID.
Unassigned legacy custom models remain in a separate needs-binding collection.

Management uses `toModelBindings`, retaining inactive definitions and resolving
unique explicit `provider.models` declarations. Policy selectors still use
`toModelCatalog`; neither inactive definitions nor unbound templates become route
candidates. Discovery remains explicitly global to all saved providers.

Independent read-only review identified two deletion boundaries, both reproduced
before fixes: removing a model must not create dangling policy references, and
ambiguous legacy declarations must not bypass provider-removal protection. The
adapter now rejects newly dangling references while retaining unchanged references
that were already stale. Browser coverage protects ambiguous provider declarations.

Real short-screen checks also exposed the initial focus landing on the close
button and sticky actions covering a focused account field. Optional `Modal`
initial focus and scroll padding fix these cases without replacing the shared
dialog. Keyboard tests check initial focus, focus trapping, reachable actions,
uncovered fields and focus restoration after Radix's asynchronous close. Existing
account metadata/inheritance, endpoint authorization, failed-save/409, shared
draft, confirmation, stale snapshot and cross-process recovery assertions remain.

| Check | Final result |
| --- | --- |
| Shell model-routing tests, gateway-control API and suite wiring | 142/142 pass, 0 skipped |
| Token-gated development Console | 16/16 pass; repeated in the final full regression |
| Production Console browser acceptance | 16/16 pass, 0 skipped |
| TypeScript and production build | Pass; 6 existing dynamic-filesystem tracing warnings remain |
| Motion gate tests | 39/39 pass, 0 skipped |
| Script syntax | 1431 files checked, 0 failures |
| Design and motion declarations | Pass; scanned=14 measured=8 baseline=8 stale=0 blocking=0 |
| Motion materials and path consistency | 21/21 files verified; 46 references resolve, 2 declared not-shipped |
| Repository-wide standards | Blocked before measurement: missing `runStandardsArgs` export |
| Final full regression | 323 files, 3003 tests: 2956 pass, 32 fail, 15 skipped, 0 cancelled; 179095 ms, exit 1 |

Browser coverage includes provider-child collections at 1440px/390px in both
themes, reduced motion, 640px-high keyboard editing, focus recovery, and the
existing 200% text-size/no-horizontal-overflow checks. Production screenshots of
all four provider width/theme combinations and both short-screen editors were
inspected. Mutation APIs are intercepted and unexpected requests fail closed;
production frame acceptance uses a separate server, never the user's port 3126.

| Production surface | Width/theme | Frames | Elements per frame | Findings | Recorder/page errors |
| --- | --- | ---: | --- | ---: | --- |
| Overview startup | 1440 | 108 | 247..247 | 0 | 0/0 |
| Providers startup | 390 | 108 | 30..64 | 0 | 0/0 |
| Policy startup | 1440 | 96 | 34..261 | 0 | 0/0 |
| Requests startup | 1440 | 109 | 34..66 | 0 | 0/0 |
| Populated provider workspace | 1440 light/dark | 108 each | 117..118 | 0 | 0/0 |
| Populated provider workspace | 390 light/dark | 108 each | 107..108 | 0 | 0/0 |

The initial full run reported 35 failures (2953 pass, 15 skipped). A controlled
two-by-two comparison, without changing product/test sources, isolates the three
extra failures to temporary-path verification inputs:

| Temporary HOME name | Path spelling | MCP path + skill tests |
| --- | --- | --- |
| Contains `aios` | macOS `/var` alias | 10/13 pass; all three extra failures |
| Contains `aios` | canonical `/private/var` | 12/13 pass; MCP scan case fails |
| Neutral `gwcheck.*` | macOS `/var` alias | 11/13 pass; two linked-ancestor cases fail |
| Neutral `gwcheck.*` | canonical `/private/var` | 13/13 pass |

The final full run uses the same canonical neutral temporary-HOME convention as
the previous iteration, an empty credential environment and explicit repository
CLI path. All three path-sensitive cases pass there. All remaining 32 failure
identities match the previous dirty-tree evidence; no new failing identities were
observed. This is not a clean-HEAD baseline and does not prove those failures are
unrelated to all existing uncommitted work. Full regression and standards are
still not green; no unrelated product fix or test relaxation was made.

Reproduce the final focused/full commands using the `clean` function below (with
canonical neutral `sandbox`, `AIOS_GATEWAY_STATE_DIR` under it, and all three temp
variables pointing to its `tmp` directory):

```sh
clean node --test scripts/tests/tooling/shell/model-routing-*.test.mjs \
  scripts/tests/tooling/shell/interface/gateway-control-api.test.mjs \
  scripts/tests/tooling/suites/test-suite-wiring.test.mjs
clean npm run test:regression
```

Final temporary evidence, not release artifacts:

- `/tmp/aios-provider-workspace-focused-final.log`, `-browser.log`,
  `-production.log`, `-typecheck-final.log`, `-build.log`, `-syntax-final.log`,
  `-design-final.log`, `-motion-declarations-final.log`, `-motion-contract.log`,
  `-contents-final.log` and `-standards-final.log` retain their respective results
  (all suffixes share the `aios-provider-workspace` prefix).
- `/tmp/aios-provider-workspace-acceptance/production/` contains the reviewed
  screenshots and eight `motion-*.json` reports. The isolated production browser
  and populated-frame driver is `/tmp/aios-provider-production-acceptance.mjs`.
- `/tmp/aios-provider-workspace-regression.log` and `-regression-comparison.json`
  preserve the initial 35-failure run. `-regression-final.log` and
  `-regression-final-comparison.json` retain the final 32-failure run and exact
  failure comparison. `-environment-comparison.json` plus the four `-env-*.log`
  files retain the controlled 13-test path comparison.
- `-regression-final-input-hashes.json` and `-regression-final-drift.json` verify
  all 5399 inputs, including nested Rex sources: no changed, missing or added
  files during the final run, and no staged-entry/content changes. Only this plan
  was subsequently edited to record evidence.
- `-final-byte-audit.json` compares the 5137-path iteration baseline: 12 existing
  paths changed in scope, four expected files added, none missing. Original staged
  renames remain staged; no new staging, commit or push occurred. The user's
  127.0.0.1:3126 service still listens on its original Node PID 97352. No real
  client configuration was edited and no paid request was made.

### Explicit access revision

- [x] Confirm that templates are not callable resources; record a byte baseline.
- [x] Default to empty gateway models/providers and retain native CLI reference data separately.
- [x] Reject unbound, unknown, disabled, or credential-less routes before any classifier/upstream call.
- [x] Require explicit `authMode: none` for unauthenticated services; never infer it from missing credentials.
- [x] Preserve existing documents/unknown metadata and shared write-lock/restore semantics.
- [x] Separate registry model identity from the exact upstream model ID, including channel collisions.
- [x] Align catalog, policy, connection gates, and running-but-not-ready empty states.
- [x] Run isolated runtime/config/browser/motion/build acceptance for the revised semantics; retain the failing full-regression and blocked-standards boundaries below.

Existing curated `provider` fields remain native launcher metadata. An explicit
custom/discovered binding or an unambiguous `provider.models` declaration is
required for gateway access. Legacy implicit routes remain on disk but are not
activated. A single explicit model can route directly; multiple models require
user-selected policy. Discovery is metadata access, not proof of generation.

- [x] Inspect design/motion contracts and current dirty baseline; user approved.
- [x] Confirm task-oriented direction with user.
- [x] Implement workspace, shared draft lifecycle, and truthful request history.
- [x] Harden registry edits and add regression coverage.
- [x] Execute verification and record measured evidence, including blocked gates.

CRG tools are not exposed in this session; use targeted searches and local tests.
The local Rex start command returned `status=completed`, `command=null`, and
`missingEvidence=[]`; no software Provider command was supplied.

## Correctness review follow-up

- Bind the provider selected for a custom model to the runtime resolver, not just
  a UI-only metadata field; explicit bindings must fail closed.
- Show account-level credential precedence and make those environment references
  editable; an endpoint change must not silently reuse hidden credentials.
- Coordinate CLI registry writes and UI saves across processes; discovery must
  not overwrite a configuration saved while it was waiting for upstream metadata.
- Reject role-matrix references to deleted models. Saving a draft must never
  acknowledge an unrouteable, dangling override.
- Distinguish saved registry data from the running gateway's startup snapshot;
  explain restart requirements rather than implying hot reload.
- Forward and revalidate the actual gateway port before connecting a client.
- Give request rows stable identities before reversing/slicing logs so polling
  preserves keyboard focus when new records arrive.

## Verification boundary

- The user's existing service on port 3126 is not stopped or reused for browser
  mutation checks. Dev acceptance uses a small temporary UI copy under
  `.cache/aios-ui-acceptance/`, a random port, and the real token gate.
- Browser API calls are intercepted and unknown requests fail closed. Backend
  handler and concurrency tests own temporary roots. Production frame recordings
  use a separate service and a GET-only authenticated relay.
- Repository-wide standards currently fails before checking any directory:
  `rex-harness/src/index.mjs` does not export `runStandardsArgs`. Do not describe
  this blocked gate or the failing full regression as passing.

## Final correctness and recovery checks

- UI and every known CLI registry writer use the same directory-lock protocol.
  Discovery/group/import snapshots are checked under the lock. External replacement
  bytes survive write verification; unreadable verification does not trigger a
  blind rollback or unlink of a newly created registry.
- Connect/disconnect acquire the registry lock before client mutations or backup
  consumption and hold it through state persistence. A real five-second timeout
  leaves the operation retryable. Legacy state with an already-consumed client
  backup can still complete registry restoration.
- Repeated connects preserve an intentionally absent prior Codex default. Separate
  ownership tracking survives sequential client connections; disconnect only
  restores the Codex default it owns, preserving other client defaults and metadata.
- Final read-only reviews found no additional high-confidence P1/P2 issues in these
  paths or the added recovery coverage. This is not a claim of exhaustive review.

## Prior workspace evidence (2026-11-15, before default-empty access)

| Check | Final result |
| --- | --- |
| Focused config/API/provider/routing/gateway/masking/connect/suite-wiring tests | 232/232 pass, 0 skipped |
| Recovery/concurrency subset of the focused run | 43/43 pass, 0 skipped |
| Independent token-gated browser acceptance | 8/8 pass, 0 skipped; repeated successfully inside the final full run |
| TypeScript and production build | Pass; build retains 6 dynamic-filesystem tracing warnings |
| Script syntax | 1425 files checked, 0 failures |
| Design and motion declarations | Pass; scanned=14 measured=8 exempt=0 baseline=8 stale=0 blocking=0 |
| Motion material and path consistency | 21/21 declared files verified; 46 path references resolve, 2 declared not-shipped |
| Repository-wide standards | Blocked before measurement by missing `runStandardsArgs` export |
| Full regression | 318 files, 2822 tests: 2775 pass, 32 fail, 15 skipped, 0 cancelled; normal completion in 129746 ms |

Browser coverage includes shared drafts across sections/history/Console views and
`ws` deep links, failed/409 saves, confirmed reload/discard, provider/account/model
editing, discovery gates, browser-local role profiles, runtime confirmation, actual
ports, request filtering and stable keyboard focus. The fixture waits for hydration
and fails on unexpected browser console warnings/errors or page errors. Screenshots
were reviewed at 1440px and 390px, in light/dark and reduced-motion layouts, including
the provider modal and the 390x640 dirty-save bar with all actions reachable.

Production recordings measured the first 1800 ms of each area through the separate
GET-only relay. These are actual frame samples, not declaration-only checks:

| Area | Width | Frames | Measured elements per frame | Findings | Recorder/page errors |
| --- | ---: | ---: | --- | ---: | --- |
| Overview | 1440 | 107 | 236..249 | 0 | 0/0 |
| Providers/models | 390 | 107 | 30..258 | 0 | 0/0 |
| Routing policy | 1440 | 106 | 34..244 | 0 | 0/0 |
| Requests | 1440 | 108 | 66..66 | 0 | 0/0 |

All 32 final failure identities (source file plus test title) also appear in both
retained earlier 35-failure logs; no new failure identities were observed. Remaining
diagnostics include missing Rex public exports/standards forwarding and context
orchestration failures, a stale training-certification HEAD baseline, and `llms.txt`
release drift. The earlier logs are not clean-HEAD baselines, so this comparison does
not prove every failure predates all work in the dirty tree.

Compared with the penultimate 38-failure run, the MCP path case, three Console facts
cases, and two skill lifecycle cases now pass under the corrected verification
environment. Neutral canonical temporary paths and explicit CLI location are
verification inputs, not product fixes. The prior controlled Console comparison
was 6/9 without CLI location versus 9/9 with `AIOS_CLI`; the MCP comparison was
11/11 with a neutral HOME name versus 10/11 with an `aios`-containing name.

### Reproduction commands

Run from the repository root. The final macOS run used a canonical neutral temporary
HOME, an empty credential environment, and an explicit repository CLI path:

```sh
sandbox="$(mktemp -d /private/tmp/gwcheck.XXXXXX)"
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/home/.aios" "$sandbox/home/.config" "$sandbox/tmp"
clean() {
  env -i HOME="$sandbox/home" AIOS_HOME="$sandbox/home/.aios" \
    XDG_CONFIG_HOME="$sandbox/home/.config" PATH="$PATH" TMPDIR="$sandbox/tmp" \
    LANG=en_US.UTF-8 AIOS_CLI="$PWD/scripts/aios.mjs" "$@"
}
clean node --test \
  scripts/tests/tooling/shell/model-routing*.test.mjs \
  scripts/tests/tooling/shell/interface/gateway-control-api.test.mjs \
  scripts/tests/tooling/shell/interface/shell-labels.test.mjs \
  scripts/tests/tooling/shell/interface/shell-tokens.test.mjs \
  scripts/tests/learning/model/routing/*.test.mjs \
  scripts/tests/learning/model/gateway/*.test.mjs \
  scripts/tests/learning/model/masking/*.test.mjs \
  scripts/tests/learning/model/model-router-connect*.test.mjs \
  scripts/tests/tooling/suites/test-suite-wiring.test.mjs
clean node scripts/run-test-suite.mjs regression
npm run ui:typecheck
npm run ui:build
AIOS_GATEWAY_TEST_ARTIFACTS=/tmp/aios-gateway-acceptance \
  node --test scripts/tests/tooling/shell/interface/dev-server-trust.test.mjs
clean env AIOS_GATEWAY_TEST_ARTIFACTS=/tmp/aios-gateway-acceptance \
  node scripts/tests/tooling/shell/browser/gateway-motion.mjs
node scripts/check-syntax.mjs
node scripts/check-design-contract.mjs
npm run check:motion
npm run check:motion:contents
node scripts/aios-standards.mjs --root . --rule directoryEntries
git diff --check
```

Local evidence (temporary, not release artifacts): screenshots and frame JSON under
`/tmp/aios-gateway-acceptance/`; focused, browser, motion, typecheck, build, syntax,
standards, and full logs under `/tmp/aios-gateway-*-final.log`; full comparison in
`/tmp/aios-gateway-regression-comparison.md` and its JSON counterpart. Older complete
logs are `/tmp/aios-gateway-regression-before-concurrency.log` and
`/tmp/aios-gw-regression.log`; the prior 38-failure run is retained as
`/tmp/aios-gateway-regression-penultimate.log`.

Existing staged/unstaged/untracked work was preserved. No commit or push was made;
the user's existing service on 127.0.0.1:3126 remains running.

## Default-empty access follow-up

This iteration separates callable gateway configuration from native launcher
reference data. The evidence above belongs to the earlier workspace iteration,
not to the explicit-access implementation below.

- [x] Seed an empty gateway registry; retain native capability/model references in
  `native-model-templates.json`. Existing user documents remain authoritative and
  are not reset or deep-merged with bundled defaults.
- [x] Require explicit enabled provider/model binding, intersecting declared
  protocols, and available required credentials. Only explicit `authMode: none`
  permits anonymous requests. Curated launcher provider metadata alone is not a
  gateway binding, and matching protocols never select an upstream implicitly.
- [x] Reject an empty/unqualified route locally with `503 NO_ROUTE_CONFIGURED`,
  before classification or upstream access. One qualified model routes directly;
  multiple models require an explicit route or a locally qualified intent policy.
- [x] Preserve exact `upstreamModel` values separately from local route identity;
  discovery allocates stable cross-provider/case-conflict IDs, retains native and
  unknown metadata, and never fills active/default/intent policies automatically.
- [x] Distinguish new standard API endpoints from legacy relay-format providers;
  standard Gemini puts the exact model in the URL and omits the invalid body
  `model` field. Unsupported streaming translation rejects locally with 501.
- [x] Separate listener health from startup-snapshot readiness. Console empty
  states and client-connect gates do not infer readiness from saved configuration,
  model discovery, old traffic, or a merely open port.
- [x] Mask user content before both classification and generation. Without an
  explicit session header, a continuation uses only its own request history and
  cannot borrow another conversation's cached intent; explicit sessions retain
  turn stickiness, scoped by intake protocol and client/role identity.
- [x] Re-mask translated payloads with the same request-local map, covering
  sensitive object keys serialized into tool-argument strings. Response
  restoration remains intact; the focused masking/intent recheck passes 13/13.
- [x] Persist `endpointStyle: standard` for newly imported native Claude/Codex API
  bases. Existing configured providers retain their chosen/legacy format. Import
  tests verify disk persistence, mock discovery, missing-key rejection, metadata
  preservation and repeat import without calling a real upstream.
- [x] Preflight every client edit and flush the recovery journal before the first
  write. Parser, later-write, post-rename and final-journal failures preserve
  recovery ownership; retries and disconnect do not replace the original values.
- [x] Limit isolated disconnect cleanup to owned artifacts and empty directories;
  repeated/no-connection disconnect preserves pidfiles, logs and unknown state.
- [x] Persist an atomic, flushed pending command-state journal before modifying
  the Codex registry default. A failed final state write retains the original
  restoration metadata and registry backup across retry/disconnect. Pending
  recovery rejects an unrelated external Codex edit rather than overwriting it.
  The connect/explicit/concurrency subset passes 142/142, including state-write,
  partial-repeat, backup-failure and cross-process checkpoint regressions.
- [x] Retain the pre-mutation Codex value when changing an existing connection
  from A to B. A failed registry write may leave A on disk; pending recovery
  recognizes the original, pre-mutation, or target value without accepting a
  genuinely external edit. Both modes preserve the initial registry backup and
  client values through immediate disconnect, retry, or a later non-Codex connect.
  All 14 retarget regressions also pass in an independent, network-blocked review;
  no remaining P1/P2 finding was identified within this narrowly reviewed scope.
- [x] Preserve CLI `connect --dry-run` through argument parsing and reject that
  flag on unsupported subcommands before executing them. Real-file CLI tests
  verify in-place/isolated previews and empty-route rejection under temporary HOME
  without client, registry or state writes; no built-in Codex default is advertised.

### Final explicit-access evidence (2026-11-15)

The following runs use the final implementation, temporary canonical neutral
HOME/root directories, an empty credential environment, explicit `AIOS_CLI`, and
mocks/intercepted browser APIs. No real client configurations or paid model calls
were used. The overlapping subsets below must not be added together.

| Check | Result |
| --- | --- |
| All model/router/gateway/masking/connect and native CLI tests | 360/360 pass, 0 skipped |
| Shell config/API/provider/layout, gateway-control API and suite wiring | 140/140 pass, 0 skipped |
| Connect/explicit/concurrency subset | 142/142 pass, 0 skipped |
| Independent read-only retarget review | 14/14 pass; narrowly scoped P2 fix confirmed |
| Token-gated Console browser acceptance | 9/9 pass; original empty-access 390px case passes again in final full regression |
| Deferred-response overview layout | 11/11 pass at 1440px and 390px, including empty, failed, configured, stale-connected and missing-credential states |
| Motion gate tests | 39/39 pass, 0 skipped |
| TypeScript and production build | Pass; 6 dynamic-filesystem tracing warnings remain |
| Script syntax | 1430 files checked, 0 failures |
| Design and motion declarations | Pass; scanned=14 measured=8 exempt=0 baseline=8 stale=0 blocking=0 |
| Motion material and path consistency | 21/21 declared files verified; 46 path references resolve, 2 declared not-shipped |
| Repository-wide standards | Blocked before measurement: missing `runStandardsArgs` export |
| Final full regression | 323 files, 2994 tests: 2947 pass, 32 fail, 15 skipped, 0 cancelled; 148397 ms, exit 1 |

The final full run captured 5390 input hashes, including the nested Rex sources.
Read-back after completion found no changed, missing, or added inputs. Only this
plan and the Shell README were subsequently updated to record the results. The
previous 2980-test run is retained separately because connect sources changed
during it; it is not the final implementation's acceptance run.

All 32 final failure identities match the retained earlier dirty-tree evidence;
there are no newly failing identities. This is not a clean-HEAD comparison and
does not establish that every failure is unrelated to all uncommitted work.
Remaining diagnostics include Rex public exports/standards forwarding, context
orchestration, training-certification evidence and `llms.txt` release drift.
Neither the full regression nor the repository-wide standards gate is passing.

The overview retains permanent loading/status slots, while cards and actions use
minimum-width constraints and wrapping rather than hiding overflow. Desktop and
390px screenshots were inspected, including empty/error states, the provider
dialog and the 390x640 dirty-save bar. The latest production UI sources match the
build's input snapshot; subsequent fixes affect connect recovery only.

| Production area | Width | Frames | Elements per frame | Findings | Recorder/page errors |
| --- | ---: | ---: | --- | ---: | --- |
| Overview | 1440 | 109 | 247..247 | 0 | 0/0 |
| Providers/models | 390 | 109 | 30..84 | 0 | 0/0 |
| Routing policy | 1440 | 108 | 34..261 | 0 | 0/0 |
| Requests | 1440 | 108 | 34..66 | 0 | 0/0 |

Recordings measure the first 1800 ms through the separate GET-only authenticated
relay. Acceptance timing, frame thresholds and the product trust gate were not
relaxed. The new overview layout test is registered exactly once in the regression
manifest; the six suite-wiring tests pass.

For the two final focused runs, use the `clean` function in the reproduction
commands above with these complete file selections:

```sh
clean node --test \
  scripts/tests/learning/model/*.test.mjs \
  scripts/tests/learning/model/gateway/*.test.mjs \
  scripts/tests/learning/model/routing/*.test.mjs \
  scripts/tests/learning/model/masking/*.test.mjs \
  scripts/tests/foundation/native/*.test.mjs
clean node --test \
  scripts/tests/tooling/shell/model-routing*.test.mjs \
  scripts/tests/tooling/shell/interface/gateway-control-api.test.mjs \
  scripts/tests/tooling/suites/test-suite-wiring.test.mjs
```

Final local evidence, not release artifacts:

- `/tmp/aios-explicit-model-native-final.log`,
  `/tmp/aios-explicit-shell-final.log`, and
  `/tmp/aios-explicit-connect-final.log` contain the focused results.
- `/tmp/aios-explicit-regression.log`,
  `/tmp/aios-explicit-regression-comparison.json`,
  `/tmp/aios-explicit-regression-input-hashes.json`, and
  `/tmp/aios-explicit-regression-final-drift.json` retain the final full result,
  failure identities, input snapshot and zero-drift verification.
- `-initial` and `-second` regression logs, comparison JSON and input snapshots
  preserve the superseded runs, including the initially failing 390px case.
- `/tmp/aios-explicit-{typecheck,build,motion,syntax,design,motion-contract,motion-gates,contents,standards,diff-check}-final.log`
  retain the corresponding gate results; the build warning count is 6.
- `/tmp/aios-explicit-gateway-acceptance/` holds the final four frame JSON reports;
  `/tmp/aios-ui-browser-final/` and `/tmp/aios-overview-layout/` hold the inspected
  screenshots. The initial overview recording's stderr is retained separately
  as `motion-overview-desktop-initial.stderr.txt`, not as a final failure.
- `/tmp/aios-explicit-final-byte-audit.json` compares the original 5131-path byte
  baseline: 49 existing paths changed within scope, 6 expected files added, none
  missing. The original three staged renames remain staged; no new staging,
  commit or push was performed. The existing 127.0.0.1:3126 listener remains on
  its original Node PID 97352.

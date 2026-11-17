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

## Routing policy unification (accepted follow-up)

Checkpoint before this iteration: `50478eb8` (107 accumulated gateway paths,
no push). The independently dirty `rex-harness` gitlink/content is excluded.
The pre-edit snapshot is `/tmp/aios-policy-baseline.json` (5399 input files).
The focused precommit config/API/concurrency/provider run passed 108/108.
Existing repository-wide 32 failures and the standards export blocker remain
unresolved; neither is a release approval.

### Scope and test contract

- Goal: one sidebar model-routing destination, with internal policy tasks for
  default assignments, sparse client exceptions, and optional intent routing.
- Default rows show configured/draft result and source; editing is explicit.
  Ordinary conversation edits `activeModel`/`clientDefaults`, while role tasks
  edit the role matrix. Missing old references remain visible, not inheritance.
- Client exceptions can be added, modified and restored to inheritance without
  deleting another client's rules. All sections retain one shared draft/save.
- Intent forms are collapsed when disabled; enabling discloses extra classifier
  calls/cost. Rule IDs are advanced fields. Failure returns to normal routing,
  which may still have no compatible candidate; no guaranteed success claim.
- Role profiles remain browser-only role-matrix snapshots under tools. Existing
  unused routing groups remain in a collapsed compatibility area.
- Non-goals: runtime scheduling changes, weights/rotation/cost optimization,
  credential verification, real client mutations, paid calls, push, or restarting
  the existing 3126 listener.

| Observable acceptance | Public test seam |
| --- | --- |
| Ordinary defaults and sparse exceptions round-trip without losing metadata | `toEditable` / `applyEdits` / `validateDocument`, real PUT/GET API |
| New invalid references rejected; untouched old references retained | Adapter and API fixtures |
| Draft source/result does not reuse a stale saved automatic preview | Pure draft-policy projection and provider/model edits |
| One sidebar destination; old policy URL still works | Real token-gated Console browser |
| Explicit edit/cancel, sparse restore, optional intent and profile scope | Real browser controls and fail-closed API fixture |
| Failed save/409, shared draft and confirmed reload/discard survive | Existing browser and lock/concurrency regressions |
| Desktop/390px, both themes, reduced motion, 200% text, short keyboard flow | Browser with actual generated CSS, production build and frame recordings |

The minimal vertical RED slice is a real ordinary-default adapter round trip
plus the actual Console policy interaction. Tests must observe saved fields and
rendered results; no hidden legacy controls, weakened assertions or new skips.
Structural graph MCP is not exposed in this session; direct caller/import and
test inspection provides the bounded impact map. Rex start returned completed
with no current Command, so no software Provider is fabricated.

### Implementation and review fixes

- Implemented the three policy tasks, explicit assignment/restore editor, sparse
  client exceptions, result/source labels, optional intent form, role-only tools,
  compatibility disclosure, and shared save summary. `/routing/config` remains
  compatible; both policy entries highlight the single model-routing sidebar item.
- Added safe scalar default editing and a whitelisted `policyContext`. Draft
  projection uses only configuration, not real environment overrides or credentials.
  Inheritance previews change a copy. New picks require qualified explicit bindings;
  untouched unavailable references remain visible and survive unrelated saves.
- Kept `resolveGatewayRoute()` unchanged as the runtime oracle. Projection tests
  cover all four incoming protocols without incorrectly filtering gateway candidates
  by the incoming protocol; translation/authentication/quota can still fail.
- Fixed a reproduced nested-overlay lock: Radix dismissal/focus registries must be
  physical singletons, even when nested copies have identical versions. Aligned
  dependencies and the lockfile; browser coverage checks layered Escape, restored
  focus, cleared body pointer lock, and continued page interaction.
- Independent backend review found two boundary bugs. New tests first failed 9/35,
  then passed 35/35 after fixes: provider removal now compares actual before/after
  providers, rather than treating absent `native-launcher` metadata as a deletion;
  empty-role projection now preserves the runtime chain of preferred target,
  client default, rule fallbacks, then active model. It never infers `general`.
  Added real PUT/backup and browser regressions, and corrected precedence/translation
  copy. Follow-up scoped backend review and UI review reported no remaining P1/P2.
- Removed the unused `model-picker.tsx`. The new policy components occupy one
  semantic subdirectory, with no growth in the parent directory entry count.
  `model-routing.mjs` remains the single config-edit/validation owner (539 lines);
  the separate pure projection is 130 lines. The standards command is still blocked
  before measurement, so these counts are not a standards-pass claim.

### Reviewed local verification (2026-11-16)

| Check | Observed result | Local evidence |
| --- | --- | --- |
| Focused adapter/API/concurrency/provider/policy/oracle/intent selection | PASS 222/222, zero skipped | `/tmp/aios-policy-focused-latest.log` |
| Actual development Console behind token gate | PASS 25/25, zero skipped | `/tmp/aios-policy-browser-reviewed.log` |
| Actual production Console browser interactions | PASS 24/24, zero skipped | `/tmp/aios-policy-production-reviewed.log` |
| Three populated policy tasks, two widths, two themes | PASS 12 reports, 108 frames each, zero findings/recorder/page errors | `/tmp/aios-policy-acceptance/production-reviewed/motion-policy-*.json` |
| Four original gateway first-screen frame checks | PASS 101-108 frames each, zero findings/errors | `/tmp/aios-policy-first-screen-reviewed.log` |
| `npm run ui:typecheck` | PASS | `/tmp/aios-policy-typecheck-reviewed.log` |
| `npm run ui:build` | PASS, six retained dynamic filesystem tracing warnings | `/tmp/aios-policy-build-reviewed.log` |
| `npm run syntax:check` | PASS 1434 files, zero failures | `/tmp/aios-policy-syntax-reviewed.log` |
| `npm run check:design`, `npm run check:motion` | PASS | `/tmp/aios-policy-{design,motion}-reviewed.log` |
| `npm run standards -- --root . --rule all` | BLOCKED: missing `runStandardsArgs` export, before measurement | `/tmp/aios-policy-standards-reviewed.log` |
| Existing 3126 listener, intercepted fixture APIs only | PASS empty-role preview, navigation, rule copy, nested Escape and page unlock; zero writes | `/tmp/aios-policy-existing-service-reviewed.log` |

Counts above overlap and must not be added into a unique-test total. Desktop and
390px browser runs exercise both themes, reduced motion, 200% text, short-screen
keyboard actions, shared drafts, failed saves/409, confirmation, local role-only
profiles, and stale references. Reviewed development and production screenshots
are in `/tmp/aios-policy-browser-reviewed/` and
`/tmp/aios-policy-acceptance/production-reviewed/`. Full-page captures include the
fixed save bar at its viewport position; the viewport/keyboard cases verify that
actions remain reachable while scrolling. No actual upstream generation or quota
verification was performed.

Reproduce the final focused selection with the isolated `clean` helper above:

```sh
clean node --test \
  scripts/tests/tooling/shell/model-routing*.test.mjs \
  scripts/tests/tooling/shell/data/model-routing-policy.test.mjs \
  scripts/tests/tooling/shell/interface/gateway-control-api.test.mjs \
  scripts/tests/tooling/shell/interface/shell-tokens.test.mjs \
  scripts/tests/tooling/shell/interface/shell-labels.test.mjs \
  scripts/tests/tooling/suites/test-suite-wiring.test.mjs \
  scripts/tests/learning/model/gateway/model-router-gateway-routing.test.mjs \
  scripts/tests/learning/model/routing/model-router-client-role-matrix.test.mjs \
  scripts/tests/tooling/shell/browser/intent-routing.test.mjs
AIOS_GATEWAY_TEST_ARTIFACTS=/tmp/aios-policy-browser-reviewed \
  node --test scripts/tests/tooling/shell/interface/dev-server-trust.test.mjs
node /tmp/aios-policy-production-reviewed.mjs
AIOS_GATEWAY_TEST_ARTIFACTS=/tmp/aios-policy-first-screen-reviewed \
  node scripts/tests/tooling/shell/browser/gateway-motion.mjs
```

Before this verification-only documentation update, the final 5407-file input
snapshot `/tmp/aios-policy-latest-input.json` had zero byte drift, confirmed by
`/tmp/aios-policy-pre-documentation-audit.json`. The independently dirty submodule
also had zero byte drift from the original baseline. Its index gitlink remains
`6563c82789853ff4a17a921b18aaa6b7a60480de`, and its worktree HEAD remains
`f143b9f6bb53461cf6f7fe1e3fb05a5568d6cfa3`. This iteration is unstaged and
uncommitted, with no push. The original 3126 listener remains PID 97352.

### Final repository comparison and delivery limits

The authoritative final-input `clean npm run test:regression` run completed:
325 files, 3063 tests, 3016 passed, 32 failed, 15 skipped, zero cancelled; exit 1.
The isolated runner removed its temporary sandbox. Compared by exact source
location and test title with the retained earlier dirty-tree run (323 files,
3003 tests, 2956 passed, 32 failed, 15 skipped), all 32 failure identities repeat:
zero added and zero removed. Observed failure groups are runtime/HUD missing Rex
exports (6), context lifecycle/MCP (4), standards/contracts/forwarding (18),
training evidence baseline (1), and `llms.txt` release drift (3).

This is not a clean-HEAD comparison and cannot establish that every accumulated
change is unrelated to those failures. The repository is not all green. Neither
matching failures nor the focused/browser passes waive the blocked standards
measurement or constitute release approval. These unrelated failure areas and the
independently dirty `rex-harness` were not changed to manufacture a green result.

Final local evidence:

- `/tmp/aios-policy-regression-latest.log` and
  `/tmp/aios-policy-regression-latest-comparison.{json,md}` contain the completed
  result, input-log hashes and all 32 exact failure identities.
- `/tmp/aios-policy-compare-final.mjs` asserts a completed outer summary, unique
  failure identities and agreement between parsed failures and the failure count.
- `/tmp/aios-policy-regression-final.log` and its earlier comparison are
  pre-review-fix evidence, not the final result. The first post-review rerun,
  `/tmp/aios-policy-regression-reviewed.log`, is also superseded: its input audit
  found an intent-copy test assertion changed during execution. The final-input
  rerun removes that timing ambiguity; no product code changed in that interval.
- `/tmp/aios-policy-delivery-byte-audit.json` permits only this plan's
  verification-documentation change after the tested input snapshot, with no
  product/test or submodule byte drift. `/tmp/aios-policy-delivery-input.json`
  snapshots the resulting delivery tree; its zero-drift check is
  `/tmp/aios-policy-delivery-input-drift.json`.

Local experience entry: `http://127.0.0.1:3126/routing?section=policy`. The earlier
accumulated gateway snapshot is commit `50478eb8d3c72bbae4b61b90d16f07f54bd201b5`;
this routing-policy iteration remains uncommitted for user feedback. Real client
configuration was not changed, no paid generation was requested, and the original
listener was not stopped or restarted. Edits remain draft-only until the shared
save action; saving writes the registry, and the running gateway needs a restart
to load it, as disclosed by the UI.

### Verification verdict

Scope: local trial is ready with the limits above; full-repository/release
acceptance remains rejected. Retry budget: 3, remaining: 0 for this verification
batch; scope is not expanded to repair unrelated repository gates.

VERDICT:
FILES_REVIEWED:
  - `apps/shell/ui/src/lib/config/model-routing.mjs:380-417` (changed; reference validation).
  - `apps/shell/ui/src/lib/config/routing-policy.mjs:1-130` (added; draft-only projection).
  - `apps/shell/ui/src/components/console/model-routing/routing-config.tsx:1-72` (changed; policy tasks and rules).
  - `scripts/tests/tooling/shell/data/model-routing-policy.test.mjs:1-335` (added; persistence/runtime parity).
  - `scripts/tests/tooling/shell/model-routing-config-api.test.mjs:1-356` (changed; real handler and backups).
  - `scripts/tests/tooling/shell/browser/routing-policy-workspace.mjs:1-174` (added; actual browser behavior).
CHECKS:
  - PASS: `npm run ui:typecheck`; `npm run ui:build` (six tracing warnings retained).
  - PASS: focused `node --test` selection above, 222/222; development browser 25/25; production browser 24/24.
  - PASS: 12 populated policy frame reports and four original first-screen reports, zero findings/errors.
  - PASS: `npm run syntax:check`; `npm run check:design`; `npm run check:motion`; `git diff --check`.
  - FAIL: `clean npm run test:regression`, 32 failures, exact identities unchanged against retained dirty-tree run.
  - BLOCKED: `npm run standards -- --root . --rule all`, missing `runStandardsArgs` export before measurement.
CODE:
  > const removedProviders = new Set(Object.keys(before.providers || {}).map(lower).filter((id) => !providerIds.has(id)));
VALIDATION:
  REJECTED - score: 0.9, complete: false,
  missing: [clean full-repository regression, executable standards measurement].
  next_actions: resolve the recorded repository failures and the public Rex export mismatch in separately authorized work, then rerun both gates. Local UI trial may proceed; no release/push approval is implied.

### Pre-release correction: remove erroneous template policies

- User supersedes the earlier stale-reference retention requirement: this iteration
  is unreleased; wrong native defaults are not a compatibility contract.
- Baseline remains dirty at `50478eb8`; no pull/reset/stash, push, client writes,
  paid requests, service restart, or `rex-harness` changes. Input snapshot:
  `/tmp/aios-policy-cleanup-input.json` (5407 files). CRG executable unavailable;
  targeted source/caller/test inspection is the graph fallback.
- Reuse the existing adapter, empty gateway seed, and shared registry write lock /
  backup / hash verification. No automatic migration or cleanup-on-GET is added.
- Remove missing/unbound strategy-reference exemptions and UI retention messages /
  injected unavailable options. Existing explicit, unambiguous protocol-compatible
  bindings may remain assigned while disabled; that is user pause state, not an
  exemption for missing models/providers. Unknown valid client/role metadata stays.
- Local cleanup preflight aborted before any write: the registry also contains
  `testgrp` referencing absent `m1` / `m2`, not an empty group map. Asked the user
  rather than deleting uncertain configuration. User explicitly chose **code
  changes only**. Do not alter the local registry, make a cleanup backup, or run
  the aborted cleanup script again. Native CLI templates are not deleted either.
- Verify changed contracts with adapter/API/storage tests and actual browsers,
  including first-install emptiness, valid custom configurations, pause state,
  failed saves/409, and cancellation/inheritance. Previous acceptance evidence
  does not validate this correction; repository-wide limitations above remain.

#### Correction implementation and current evidence (2026-11-16)

The preceding acceptance of unchanged missing/unbound references is superseded,
not merely hidden in the interface. The adapter now validates all seven editable
policy reference locations on every save, including no-op and omitted-field PUTs.
Missing, unbound, ambiguous and protocol-incompatible assignments require explicit
repair; failed validation does not write registry bytes or create a backup.
`validateDocument(document)` checks a saved snapshot, so valid paused bindings may
remain assigned. With `previousDocument`, new assignments additionally require an
enabled binding. No unconditional unchanged-ID/unchanged-section bypass remains.

Assignment retention messages and injected intent unavailable-model options are
removed. Intent selectors contain qualified choices only; an unqualified current
value displays the selection placeholder without changing the draft. Genuine
runtime-unavailability diagnostics, native CLI aliases, valid unknown client/role
keys and extension metadata remain. No runtime candidate-chain change, automatic
migration, cleanup-on-read or new registry initializer was introduced. The shared
adapter remains the single edit/validation owner and shrank from 539 to 533 lines;
an unrelated module split was not added to this correction.

| Current check | Observed result | Temporary evidence |
| --- | --- | --- |
| Focused adapter/API/concurrency/recovery/provider/policy/runtime-oracle/intent selection from the command above | PASS 233/233, zero skipped | `/tmp/aios-policy-cleanup-focused-final.log` |
| Token-gated development Console | PASS 26/26, zero skipped | `/tmp/aios-policy-cleanup-browser-final.log` |
| Current production build, full gateway browser interactions | PASS 25/25, zero skipped | `/tmp/aios-policy-cleanup-production-final.log` |
| Populated policy tasks, desktop/mobile and both themes | PASS 12 reports, 108 frames each, zero findings/recorder/page errors | `/tmp/aios-policy-cleanup-production/motion-policy-*.json` |
| TypeScript / production build | PASS; six retained dynamic-filesystem tracing warnings | `/tmp/aios-policy-cleanup-typecheck-final.log`, `/tmp/aios-policy-cleanup-build.log` |
| Script syntax | PASS 1434 files, zero failures | `/tmp/aios-policy-cleanup-syntax-final.log` |
| Design / motion declarations / shipped motion contents | PASS; scanned=14 measured=8 baseline=8 stale=0 blocking=0; 21 material hashes and 46 references verified | `/tmp/aios-policy-cleanup-{design,motion,contents}-final.log` |
| Motion gate tests | PASS 39/39, zero skipped | `/tmp/aios-policy-cleanup-motion-tests-final.log` |
| Repository standards | BLOCKED before measurement: missing `runStandardsArgs` export | `/tmp/aios-policy-cleanup-standards-final.log` |
| Full regression | FAIL: 325 files, 3075 tests, 3028 pass, 32 fail, 15 skipped, zero cancelled; 223151 ms, sandbox removed | `/tmp/aios-policy-cleanup-regression-final.log` |

These test counts overlap and are not additive. The first development run failed
only because the fresh-install fixture counted the header workspace selector as
a policy selector; both assertions are now scoped to `main`, retaining the
zero-policy-selector requirement. The corrected complete browser run passes.
Production desktop/dark, mobile intent, empty policy and 390x640 dirty-save-bar
screenshots were inspected. The RED adapter regression is retained in
`/tmp/aios-policy-cleanup-red.log`; earlier 72/72 adapter tests, 54/54 delegated API
tests and 14/14 offline intent tests are subsumed by the final focused selection.

The completed full-run comparison in
`/tmp/aios-policy-cleanup-regression-comparison.{json,md}` finds the same 32 exact
failure identities as the retained earlier dirty-tree run: zero added, zero
removed. That baseline is not clean HEAD. This does not establish independence
from all accumulated work, waive the standards blocker, or approve a release.
No unrelated failing area or independently dirty `rex-harness` was repaired.

The 5407-file validation input snapshot is
`/tmp/aios-policy-cleanup-validation-input.json`; its post-test audit
`/tmp/aios-policy-cleanup-post-tests-drift.json` reports zero changed, missing or
added inputs and zero submodule drift. Only this evidence documentation is edited
after that audit. Relative to this correction's original input, changes remain
limited to the expected 12 source/test/plan paths, with no added/deleted inputs.

Local safety is recorded separately because the registry is ignored by Git:
`/tmp/aios-policy-cleanup-local-safety-input.json` records its exact hash, size,
modification time, seven existing backup names and original listener PID 97352.
Read-back after browser execution confirms unchanged registry bytes and mtime,
no new backup and the same listener. The aborted cleanup script was removed and
never reached its write path. The local incorrect data, including `testgrp`, is
**still present by user choice**; this is not a restored-first-install claim.
No real client configuration or paid upstream request was used. No staging,
commit, push, or restart of the original `127.0.0.1:3126` service was performed.

#### Independent review follow-up: classifier protocols and disabled intent repair

Independent review returned after the preceding report and found two P2 gaps:
the classifier check rejected the supported singular `model.protocol` field,
and disabled intent routing with stale references could not be repaired in the
UI when too few models (or no compatible classifier) prevented enabling it.
The 233/26/25 results above precede these fixes and do not verify them.

Decision: the configuration adapter owns classifier protocol eligibility and
must use the catalog's normalized protocols, including singular fallback and
alias handling, without restoring any unchanged-reference exemption. The
intent section owns an explicit clear action for disabled, nonempty settings.
Reuse the shared Modal/Button confirmation and existing `onChange` shared-draft
boundary; focus the safe cancel action initially and preserve cancellation and
Escape focus restoration. Confirmation clears the classifier and all rules,
keeps routing disabled and preserves other settings/metadata; only unified save
writes. Empty installations get no repair action. Hiding validation errors,
automatically clearing values, enabling an unusable classifier just to edit,
and introducing a second save endpoint were rejected. A full disabled editor
would add unnecessary duplicate editing states for this repair requirement.

Preflight found the same known dirty tree and no input/submodule drift against
`/tmp/aios-policy-cleanup-delivery-input.json` (5407 inputs); no pull, stash or
reset was attempted. CRG is not available in this session; targeted source,
caller and shared-control searches plus real adapter/API/browser tests are the
fallback. The two fixes stay in existing owners with no new product module or
runtime change. RED offline UI tests fail at the missing repair action in all
five blocked scenarios, not at setup (`/tmp/aios-policy-p2-ui-red.log`).

The first complete workspace run stopped the two new scenarios at an overly
specific test precondition: a config with both stale classifier and stale target
was correctly rejected first at the target, rather than the assumed classifier
field. The assertion now requires a `ConfigError` identifying the stale intent
reference, without making the validation order part of the browser contract.
The second run passed both new scenarios and exposed an immediate focus assertion
race in an existing assignment-editor scenario. The tests now wait for dialog
unmount and Radix's asynchronous close-focus restoration, then still require the
original opener to be the focused element; no product focus or validation behavior
was relaxed. Initial logs are retained as
`/tmp/aios-policy-p2-browser-{first,second}.log`.

The first protocol fix removes a redundant array-only check: the existing
binding-qualified catalog remains the single classifier protocol authority,
including strict checks for disabled intent sections. Initial protocol RED
and GREEN are `/tmp/aios-policy-p2-protocol-{red,green}.log` (21 expected failures
in RED, 79/79 GREEN); extended adapter/API/explicit-policy/runtime checks pass
145/145. Follow-up coverage also includes full editable round-trips for custom
singular-protocol models: their former empty-array projection was already present
before this P2, but leaving it would still prevent the valid-custom-save contract
from being met. That case is part of this same adapter boundary, not a data
migration or runtime expansion.

Custom singular follow-up is now verified: RED 74/106 passed (32 expected
failures), GREEN 106/106, extended GREEN 172/172. Logs:
`/tmp/aios-policy-p2-custom-protocol-{red,green,extended-green}.log`.
This includes raw custom metadata/aliases/absent defaults, unique provider-list
bindings, full and partial real-handler saves, exact backups and strict rejection
of invalid references. No local registry repair or migration was performed.

### Magpie-style provider connection revision (in progress)

User direction: implement the real provider workflow, not a renamed single-URL
Relay switch. Reference source is pinned at Magpie commit
`9c4e87736cc84bcc1924df06440cad3e7ababee0` in
`/tmp/aios-magpie-reference-9c4e877`. Source evidence:
`internal/provider/provider.go:51-118` (independent API URLs/baseAPI),
`internal/provider/presets.go:11-121` (preset categories, regions/plans),
`internal/gui/assets/app.js:9549-9622,10379-10495` (editor and save),
`internal/provider/authheader.go:13-73` (third-party Anthropic auth),
`internal/provider/gemini_api.go:15-60` (Gemini base/path handling).

Decision / applicable boundary:
- Use preset/custom channel, optional region/plan, primary API Base URL and
  independently configured additional API addresses. API format is not a vendor
  type. Blank additional URLs mean unsupported, not guessed from another API.
- Add optional `protocolBaseUrls` with canonical Chat, Responses, Claude and
  Gemini keys. Presence is authoritative; no fallback to old URL concatenation.
  Keep legacy `baseUrl`/`endpointStyle` and unchanged-save raw representation;
  only an explicit connection edit materializes old destinations as API bases.
- Add editor metadata `baseProtocol`, `preset`, `presetRegion`, Anthropic
  `authHeader`, and extra `headers`. All keys remain environment references,
  sensitive headers require references, missing referenced values fail closed,
  and explicit no-auth cannot carry alternate credential headers.
- Discovery, intent classification and forwarding share provider-aware headers.
  Every API address change resets credential-scope confirmation, including
  account and custom-header references. Form submission still stages one shared
  draft; only explicit global save writes, with the existing conflict/backup lock.

Tradeoffs / rejected alternatives:
- Do not copy Magpie's plaintext key storage, automatic save-time network fetch,
  dual-header default on all third-party Claude hosts, or URL fragment side
  effects. Existing omitted Claude auth mode stays x-api-key for compatibility;
  the editor explicitly offers x-api-key/Bearer/both.
- Reject userinfo, queries and fragments in API URLs instead of relying on
  undocumented full-endpoint `#` behavior. Supported pasted endpoint suffixes
  normalize safely at runtime; this is deliberate compatibility hardening, not
  a claim that Magpie's ordinary Chat save does the same normalization.
- API-key transports only in this slice: no OAuth/subscription/plugin account
  support, Vertex/Bedrock signing, automatic paid inference probes, or claim of
  a complete Magpie feature/preset replica. Discovery proves listed IDs only.
- Preserve strict policy validation, disabled binding roundtrips, unknown role
  metadata, exact backup/recovery and concurrent/stale snapshot semantics.

Execution / evidence:
- UI, editable adapter and runtime had separate owners. The three new focused
  tests are registered in regression. Adapter RED was 2/66 passing; focused
  GREEN 71/71, runtime GREEN 18/18, integrated GREEN 208/208. Final expanded
  routing/gateway/adapter/API/concurrency/offline UI checks passed 482/482 in
  `/tmp/aios-magpie-provider-final-extended-green.log` before the namespace
  follow-up below. Earlier incomplete-map fixture failures were fixed by
  declaring the missing Chat address, not by weakening authoritative-map checks.
- Independent UI review found dormant API metadata being enabled when editing
  another address, and unlabeled credential-scope confirmation. Both are fixed
  with tests: keep declared protocols separate from dormant map entries, compare
  active state as well as URLs, and show protocol-labelled destinations and
  labelled account/header references directly in confirmation.
- Browser RED 28/30 exposed a clean sticky save bar obstructing editing on a
  390x640 screen at 200% text. Only dirty save bars now stick; subsequent dev
  acceptance passed 30/30. The full regression also passed the dev acceptance
  and both new provider scenarios at desktop/mobile widths.
- Isolated copied-app production build and browser acceptance passed on stable
  UI/browser inputs: build exit 0, 31 test records/28 browser scenarios passed,
  60 screenshots, 12 settled-dialog recordings/937 frames with zero findings,
  recorder errors or page errors. These recordings do not prove interaction
  transitions. Source drift was empty; own server and copied sandbox were
  cleaned up. Evidence: `/tmp/aios-magpie-provider-production/summary.json`,
  `-build.log`, `-production.log`. Build retains 16 dynamic-filesystem tracing
  warnings. The first production run had dialog-source drift and is explicitly
  superseded (`-production-first-summary.json`).
- Header safety was audited across adapter/runtime. Anonymous mode forbids
  every environment-referenced custom header, sensitive names require exact
  references, and values/credentials require printable ASCII including rejection
  of supplementary Unicode and unpaired surrogates. Tests exercise failure before
  discovery, classifier or gateway fetch. URL and protected-header rules agree.
- Two obsolete discovery assertions requiring Bearer on all APIs were replaced
  with stronger exact per-API header assertions, including Anthropic version and
  absence of unrelated/provider credentials. Full regression then reported
  328 files, 3250 tests, 3203 pass, 32 fail, 15 skipped, zero cancelled; all 32
  failure identities exactly match the retained 3075-test pre-provider baseline.
  Comparison: `/tmp/aios-magpie-provider-regression-comparison.json`. This is
  not a passing full suite or a clean-HEAD comparison.
- TypeScript and 26 modified/new MJS syntax checks pass; design, motion and
  repository contents gates pass. Standards remains blocked before measurement:
  the independently dirty rex-harness public entry lacks `runStandardsArgs`.
  Do not repair/reset the submodule or claim this gate passed.
- The existing 620-line adapter remains the single editable-document projection,
  validation and lossless reconstruction owner; splitting that transactional DTO
  contract in this revision would add representation seams. This is an explicit
  soft-budget exception, not a standards-gate pass. New production modules are
  31-121 lines and remain single-purpose.
- Post-review Gemini follow-up: independent runtime/security review found that
  whole-ID escaping breaks namespaced IDs on relays. Source evidence is pinned
  Magpie `internal/provider/gemini_api.go:79-104` and
  `internal/gateway/gemini_slash_model_test.go:13-18`. RED was 17/19 passing;
  GREEN is 19/19 after preserving slash separators and escaping each segment,
  with empty/dot/dot-dot segments rejected before fetch. Explicit and standard
  paths, exact URL spellings, body removal, auth and zero-fetch rejection are
  covered. Logs: `/tmp/aios-magpie-provider-gemini-namespace-{red,green}.log`.
  The independent static re-review closed this finding with no further
  actionable issue in the delta. Earlier full-regression evidence is superseded
  for this runtime delta by the final checks below.
- Baseline `/tmp/aios-magpie-provider-input.json` records 5407 inputs. Real local
  registry, seven backups, PID 97352/port 3126 and independently dirty submodule
  remain outside all writes. No commit, push, reset, stash or pull.

Final namespace-follow-up verification (2026-11-16):
- Preserved earlier expanded/full results as
  `/tmp/aios-magpie-provider-pre-namespace-{extended-green,regression}.log` and
  the earlier input/comparison JSONs. Preflight found exactly the four intended
  router/test/README/plan changes, not an unexpected worktree change. New input:
  `/tmp/aios-magpie-provider-namespace-final-input.json` (5415 files).
- Fresh expanded checks passed **483/483**, zero failed/skipped/cancelled:
  `node --test scripts/tests/tooling/shell/interface/provider-dialog.test.mjs
  scripts/tests/tooling/shell/data/provider-connections.test.mjs
  scripts/tests/tooling/shell/model-routing-*.test.mjs
  scripts/tests/tooling/shell/data/model-routing-policy.test.mjs
  scripts/tests/learning/model/routing/*.test.mjs
  scripts/tests/learning/model/gateway/*.test.mjs`.
  Log: `/tmp/aios-magpie-provider-namespace-final-extended.log`.
- Final `npm run test:regression` used the original baseline PATH with `env -i`,
  isolated HOME/AIOS_HOME/XDG_CONFIG_HOME/gateway-state/temp, and
  `AIOS_CLI=/usr/bin/false`. Result: **328 files, 3251 tests, 3204 pass, 32 fail,
  15 skipped, zero cancelled**, sandbox removed. All 32 failure identities match
  the retained pre-provider baseline; none added or removed. Known failures
  remain in rex exports/standards, training evidence, context lifecycle and
  stale llms.txt. This is not a passing full suite or release approval.
  Log: `/tmp/aios-magpie-provider-namespace-regression-baseline-path.log`;
  comparison: the matching `-comparison.json`. Both new desktop/mobile provider
  scenarios and the full development-browser acceptance passed in this run.
- A preceding run accidentally narrowed PATH and reported 34 failures. The two
  extras were unchanged MCP landing tests that require finding the claude binary
  on PATH without executing it. With identical source, focused tests reproduced
  4/6 with narrow PATH and passed 6/6 with baseline PATH. No assertions or product
  code were changed. Preserve `-namespace-regression-final.log`, its comparison,
  and `-namespace-path-{restricted,baseline}.log`; do not erase this failed run.
- Fresh UI `npm run typecheck`, all 26 modified/new MJS `node --check` checks,
  `git diff --check`, `npm run check:design`, `npm run check:motion`, and
  `npm run check:motion:contents` pass. Logs use
  `/tmp/aios-magpie-provider-namespace-{typecheck,syntax,design,motion,contents}.log`.
  Standards still exits 1 before measurement for missing `runStandardsArgs`;
  `-namespace-standards.log` preserves the exact error. No submodule repair.
- No redundant production rebuild: the earlier successful production input
  manifests still exactly match all 84 app and 6 browser source files. Fresh
  hash audit: `/tmp/aios-magpie-provider-namespace-production-applicability.json`.
  The 31 production test records/28 scenarios, 60 PNGs and 12 settled-dialog
  recordings/937 frames remain applicable to unchanged UI/browser inputs, not
  proof of the later runtime delta. Fresh fake-fetch/runtime tests cover that
  delta. The production runner's own server/build/sandbox were already cleaned.
- Post-regression input audit reports zero input or submodule drift, with empty
  staging: `/tmp/aios-magpie-provider-namespace-baseline-path-input-audit.json`.
  This final evidence append changes only this plan after that snapshot; the
  separate `-namespace-delivery-input-audit.json` must record that exact
  documentation-only drift, not claim a zero-drift final document.
- Final read-only safety audit is retained as
  `/tmp/aios-magpie-provider-namespace-local-safety-final.json`: registry hash,
  size and mtime match the original baseline (therefore testgrp is unchanged),
  seven backup filenames match, listener remains PID 97352 on 3126, HEAD and
  submodule index/worktree HEAD match, and staging is empty. Backup contents
  were not hashed. No real-client writes, credential reads, paid requests,
  original-service restart/stop, staging, commit or push.

### Four-protocol gateway compatibility follow-up

The user explicitly requested completing the runtime compatibility layer, not
just configuring four upstream APIs. This extends the earlier UI/provider scope
to gateway codecs, streaming, intake routing and their regression tests.

- Expose Messages, Responses, Chat Completions and Gemini model-operation paths
  under `/v1`; also accept native Gemini SDK `/v1beta` paths.
- Cover all four-by-four protocol pairs in both JSON and incremental SSE modes.
  Preserve same-protocol extension fields; cross-protocol adapters must preserve
  representable text, tools, tool results, basic generation options and images,
  and reject unsupported semantics rather than silently dropping them.
- Validate conversion before any classifier/generation request. Keep explicit
  model/provider binding, credentials, routing policy and request-local masking.
- Translate HTTP/stream errors to the client's protocol; malformed or truncated
  upstream output must not become an empty successful completion. Keep upstream
  cancellation and deadlines active while response bodies are being consumed.
- Verification uses fake fetches and isolated loopback fixtures only. Baseline
  gateway tests pass 71/71; `/tmp/aios-gateway-protocol-baseline.json` records
  registry hash/size/mtime, HEAD, staging and independent submodule state.
- Real registry/testgrp, client configuration, port 3126, secret environment and
  the dirty submodule remain untouched. No paid requests, commits or pushes.

#### Protocol review and verification method

- Independent fixture-only reviews cover request/JSON codecs, stream codecs and
  proxy resource lifetimes separately. Findings are not waived because the initial
  matrix was green: regressions additionally cover inclusive cache accounting,
  retained stream metadata limits, token-limit tool truncation, unsupported
  metadata, Responses item states, privacy defaults, parallel Gemini tool turns,
  schema/name/image portability and JSON/SSE masking escapes.
- Native stream-mode rejection has explicit RED/GREEN evidence. A native
  non-stream request previously accepted an unfinished upstream SSE response with
  HTTP 200; it now returns a protocol-shaped 502 and cancels upstream before
  committing success headers. The final independent lifecycle re-review passed
  28/28 tests, including an upstream cancellation promise that never resolves.
  Evidence: `/tmp/aios-gateway-protocol-native-mode-red-second.log` and
  `/tmp/aios-gateway-protocol-native-mode-green.log`. The first RED invocation
  timed out because its failing assertion did not cancel the deliberately stalled
  fixture; the second RED cleans up that fixture and fails promptly as intended.
- Connect readiness now uses the same JSON/SSE capability source as the runtime,
  rather than the obsolete Codex/Gemini whitelist. Its 41/41 focused temporary
  fixture tests cover all four upstream protocols for Claude/Codex/Pi in both
  connect modes, reconnect ownership and restoration. No real connect was run.
- Expanded and full regression runs use the baseline PATH and an explicit empty
  environment with isolated HOME, AIOS_HOME, XDG_CONFIG_HOME, gateway state and
  temp roots; `AIOS_CLI=/usr/bin/false` prevents a globally installed CLI from
  being mistaken for the test target. Source/test/package/plan hashes are captured
  immediately before and after each run, separately from live registry hash,
  size/mtime, HEAD/index and independent submodule status checks. This is not a
  claim to have read or snapshotted local credentials/client configurations.
- The standards entry remains blocked before measurement by the independent dirty
  submodule's missing `runStandardsArgs` export. This revision does not repair or
  reset that submodule. Evidence: `/tmp/aios-gateway-protocol-standards.log`.

#### Final protocol evidence and architecture disposition (2026-11-16)

- Runtime code is grouped under
  `scripts/lib/tooling/model-router/gateway/compatibility/`: `protocol-codec.mjs`
  owns request/JSON normalization and portability decisions; `protocol-stream.mjs`
  owns incremental protocol state transitions; `protocol-mask.mjs` owns parsed
  value/escaped-argument restoration; `proxy.mjs` owns one routed request and its
  lifetime. The public legacy `gateway/translate.mjs` and
  `gateway/stream-translate.mjs` paths and bytes remain unchanged from HEAD.
- This is a semantic path grouping, not a behavior rewrite. All non-import bytes
  of the four moved runtime files are unchanged. The runtime gateway directory
  now has 8 working-tree entries, its compatibility child 4, the gateway test
  root 8 and its protocol child 7. All seven moved tests remain registered.
  Runtime consumers have no stale old-path imports; three old references in the
  untouched 2026-11-13 historical plan remain historical records. Evidence:
  `/tmp/aios-gateway-protocol-runtime-grouping.json`,
  `/tmp/aios-gateway-protocol-legacy-grouping-audit.json` and
  `/tmp/aios-gateway-protocol-final-structure.json`. The first structure audit
  caught those historical references; its unfiltered report is retained as
  `/tmp/aios-gateway-protocol-final-structure-first.json`, not silently overwritten.
- Explicit soft file-budget tradeoff: the codec (1009 physical lines), stream
  machine (871), masking parser/channels (600) and proxy (509) retain the single
  owners above instead of introducing numbered fragments or cross-module mutable
  state seams during correctness hardening. Concern-specific matrix/codec/stream/
  lifecycle and masking tests also exceed 400 lines (418-849), retaining their
  complete fixtures and assertions. These are documented design exceptions only:
  no configured exemption/baseline was added, and prose does not make the blocked
  quantitative standards gate pass. A later semantic extraction remains possible
  but is not silently bundled into this verification-only closing batch.
- Masking is wired after translation using the client wire protocol. Parent
  regressions cover all 16 pairs in JSON/SSE (32 cases), plus native JSON failure
  propagation and single-502 stream failure recording. An independent narrow
  wiring review passed 86 in-memory fixtures. It found no remaining wiring issue.
- Independent truncation review confirmed native Chat/Responses JSON and all nine
  Chat/Claude/Responses SSE pairs preserve valid token-limit argument prefixes,
  placeholder carry and pending backslash/Unicode escapes without invented
  closers. Ordinary completion, impossible syntax and unexplained EOF remain
  strict. Responses deferred state remains bounded, including 4200 closed items.
  Two further findings (unterminated-frame sequence collision and explicit
  upstream-failure handling after partial arguments) received 17 new regressions.
  Independent closure checks passed 4 sequence, 32 failure, 12 negative and 2
  deferred-state cases. The entire masking test file now passes 132/132.
- Remaining expressiveness boundary: native Chat/Responses JSON can retain
  explicit token-limit incomplete argument strings; cross-protocol JSON requires
  complete argument JSON. Gemini always requires a complete argument object.
  Unsupported state, strict tools, thinking/signatures, multimodal formats and
  unrepresentable options still fail explicitly. No remote image fetch/transcode
  or fabricated successful terminal was introduced.
- Final expanded command:
  `node /tmp/aios-gateway-protocol-run-isolated.mjs expanded canonical-final`:
  52 files, 1300/1300 passed, zero skipped/cancelled. All 2447 monitored inputs and
  protected local state were unchanged during the run. Logs and hashes:
  `/tmp/aios-gateway-protocol-expanded-canonical-final{.log,-inputs-before.json,-drift.json}`.
- Fresh isolated UI typecheck, design, motion and contents gates exited 0, with
  83 monitored inputs unchanged:
  `/tmp/aios-gateway-protocol-ui-gates-final.json` and the corresponding
  `/tmp/aios-gateway-protocol-{typecheck,design,motion,contents}-final.log`.
- Preserve the first full regression: 3834 tests, 3784 pass, 35 fail, 15 skip;
  all original 32 failures retained plus three isolation-induced failures.
  `/tmp/aios-gateway-protocol-regression-final{.log,-comparison.json,-drift.json}`.
  Minimal unchanged-test comparison isolates two macOS `/tmp` symlink-ancestor
  refusals and one false stale-path hit caused by `aios` in the temporary HOME
  prefix. Only the external `/tmp` runner changed to a realpath and neutral temp
  prefix; no product/test logic or assertion changed. The two affected test files
  then pass 13/13, and all 2447 source hashes match the first full run.
  Evidence: `/tmp/aios-gateway-protocol-sandbox-comparison-resolved.json`,
  `/tmp/aios-gateway-protocol-sandbox-mcp-diagnostic.log` and
  `/tmp/aios-gateway-protocol-sandbox-source-equivalence.json`.
- Final full command:
  `node /tmp/aios-gateway-protocol-run-isolated.mjs regression canonical-final`:
  332 files, 3834 tests, 3787 pass, 32 fail, 15 skip, zero cancelled, exit 1.
  Failure identity comparison retains exactly 32/32 baseline failures with no
  additions/removals. This is the retained dirty-worktree baseline, not a clean
  HEAD comparison or a passing full suite. The 2447 monitored inputs and protected
  local state did not drift. Evidence:
  `/tmp/aios-gateway-protocol-regression-canonical-final{.log,-inputs-before.json,-drift.json,-comparison.json}`.
- Final syntax/diff/safety command:
  `node /tmp/aios-gateway-protocol-final-audit.mjs canonical-final` passed all
  48 modified/new MJS syntax checks and `git diff --check`. Registry SHA256
  `6bb74135913042ee8a65093c1b52d1b3343bedd79b8045e9acb9c125817fbca2`,
  29144 bytes and mtimeMs 1794745077760.8228 still match the baseline, so testgrp
  is unchanged. Seven backup filenames, listener PID 97352 on 3126, HEAD, empty
  staging and independent submodule index/worktree HEAD/status also match.
  Backup contents and real-client configurations were not read. Evidence:
  `/tmp/aios-gateway-protocol-{syntax,local-safety}-canonical-final.json`.
- The fresh standards invocation still exits 1 before measurement:
  `SyntaxError: The requested module '../rex-harness/src/index.mjs' does not provide an export named 'runStandardsArgs'`.
  Evidence: `/tmp/aios-gateway-protocol-standards-final.log`. The broken
  `verification-before-completion` skill symlink was not repaired; the available
  `verification-loop` reference and fresh command evidence were used instead.
  CRG was unavailable, so import searches, grouping hashes and tests supplied the
  dependency check rather than invented graph results.
- This final evidence append and the README snapshot are the only intended
  post-regression changes. The closing audit must record their exact before/after
  hashes as documentation-only drift, not claim that final documents are equal to
  the regression snapshot:
  `/tmp/aios-gateway-protocol-delivery-input-audit.json`. The companion
  `-syntax-delivery.json` and `-local-safety-delivery.json` recheck syntax/diff and
  local safety after the append. No real-client writes, paid calls, service
  restart/stop, submodule repair, staging, commit or push were performed.

Release/readiness verdict (not a claim that the full repository is green):

```text
VERDICT:
FILES_REVIEWED:
  - gateway/compatibility/{protocol-codec,protocol-stream,protocol-mask,proxy}.mjs:
    lines 1-1009 / 1-871 / 1-600 / 1-509 (new or moved/changed)
  - gateway/protocol tests and gateway masking test: registered, assertions retained
CHECKS:
  - expanded canonical-final: PASS (1300/1300)
  - syntax (48 MJS), diff, UI typecheck/design/motion/contents: PASS
  - regression canonical-final: FAIL (32 retained baseline failures; 0 added)
  - standards all: BLOCKED (missing independent submodule export)
CODE:
  > const unmasked = masking ? unmaskProtocolResponse(translated, route.clientProtocol, maskStore) : translated;
VALIDATION:
  REJECTED - score: 0, complete: false,
  missing: [green full-repository regression, executable standards disposition]
  next_actions:
    - Resolve the 32 independent baseline failures in their owning work items.
    - Restore the submodule API under its owner's authorization, rerun standards,
      and explicitly disposition the file budgets; do not treat prose as a waiver.
  retry_budget: 3 remaining: 0
```

## Intent-rule UI follow-up (2026-11-16)

Scope: the user selected **B, summary list with inline editing**, after reporting
that the always-expanded rule cards felt disconnected from the surrounding UI.
This is a presentation/editing change, not another gateway compatibility change.
The existing dirty worktree is retained; nothing is staged, committed or pushed.

- Replace per-rule cards with one divided list. Each closed row shows a two-line
  description summary, the qualified target model, and an explicit edit action.
  Empty descriptions and missing/disabled targets remain visible as pending
  states; raw invalid model references are neither exposed nor silently repaired.
- Open one inline editor at a time using the existing shared Textarea/Select.
  Native disclosure buttons expose expanded state and a summary description to
  assistive technology. Enter/Space operate the disclosure, and Tab reaches the
  editor. Opening, switching and collapsing editors never emit draft changes.
- New rules open with description focus. Deleting a rule preserves surviving
  row identity and focuses its neighbor, the add button, or the enabled switch
  when no additions are eligible. Local numeric UI keys, not editable/possibly
  duplicate internal IDs or changing list indexes, identify rules. Replacing the
  controlled document resets the editor; UI metadata never enters configuration.
- On narrow screens the ordinal/edit action and summary occupy separate lines,
  so neither long model names nor 200% text are squeezed by the action column.
  The inline editor avoids additional narrow-screen horizontal insets. The first
  two verification passes caught these two separate layout issues; both were
  fixed without weakening the overflow/minimum-readable-width assertions.
- Model eligibility, classifier qualifications, shared draft validation,
  disabled-form unmounting, safe clear confirmation and unified save are retained.
  Integration checks confirm that collapse/task navigation do not save and that
  reopening a saved rule does not dirty the workspace.

Fresh verification for this UI follow-up (not the prior protocol snapshots):

- `node /tmp/intent-routing-ui-b-run-tests.mjs`: **30 Shell test files,
  497/497 passed, zero skipped/cancelled**, including the real isolated Next
  development-server integration and offline shared-control fixtures. All 2447
  monitored inputs remained unchanged during the passing run. The runner uses a
  canonical neutral temporary HOME/config/state and a disabled CLI, never the
  original service or real client configurations. Evidence:
  `/tmp/intent-routing-ui-b-shell-tests-final.{log,json}` and
  `/tmp/intent-routing-ui-b-shell-inputs-final.json`.
- The focused intent fixture covers the 1440/390px x light/dark x 100/200% text
  matrix in both collapsed and expanded states, with long model labels and a
  pending rule. It fails on any external request or browser warning/error.
  Reduced motion leaves no running animation. Screenshots and a self-contained
  offline preview are in `/tmp/intent-routing-ui-b-artifacts/`.
- Independent static component/test review found no actionable issue. An
  additional offline replacement check covers list lengths 0/4/2/5/1, all
  collapsed without browser errors. Its first exploratory selector mistakenly
  counted the classifier's disclosure too; restricting it to the intent list
  resolved that harness-only timeout without a product change. Evidence:
  `/tmp/intent-routing-ui-b-replace-counts.json`.
- `npm run ui:typecheck`, design contract, motion declaration/material, release
  contents and `git diff --check`: PASS. Log:
  `/tmp/intent-routing-ui-b-gates-final.log`.
- Fresh frame commands film the self-contained fixture in settled summary/editor
  states at 1440px and 390px: **73/72/72/72 frames**, with nonzero measured items,
  zero findings, zero recorder/page errors and zero unreachable requests.
  These are settled-state samples, not a claim of animated disclosure coverage;
  user-triggered disclosure is deliberately immediate (`data-snap`), and keyboard
  interactions/reduced-motion behavior are exercised separately in the browser
  tests. Evidence: `/tmp/intent-routing-ui-b-motion-final.log` and
  `/tmp/intent-routing-ui-b-motion-{summary,editor}{,-390}.json`.
- Offline normal-label visual review also measured summary text contrast at a
  minimum 5.91:1 in light and 9.77:1 in dark. No external requests or console/page
  errors occurred. Evidence: `/tmp/intent-routing-ui-b-visual-review.json`.
- The standards directory-entries command remains blocked before measurement by
  the independent submodule's missing `runStandardsArgs` export; no submodule
  repair was attempted. Log: `/tmp/intent-routing-ui-b-standards.log`. The wider
  repository suite was not rerun for this UI-only follow-up: its preceding
  32-failure baseline remains a historical limitation, not a fresh green claim.
- The closing source/safety audit permits exactly the three UI/test files and
  this plan/README evidence update relative to the preceding delivery. It also
  rechecks the registry hash/size/mtime, original 3126 listener, backup filenames,
  HEAD, index and independent submodule state. No paid request, real-client
  write or original-service restart/stop is part of this work. Evidence:
  `/tmp/intent-routing-ui-b-source-audit-final.json`,
  `/tmp/aios-gateway-protocol-local-safety-intent-ui-b-final.json` and
  `/tmp/aios-gateway-protocol-syntax-intent-ui-b-final.json`.

UI-scoped verdict (does not supersede the repository-wide release limitations):

```text
VERDICT:
FILES_REVIEWED:
  - intent-routing-section.tsx: lines 1-319 (local UI behavior and presentation)
  - intent-routing.test.mjs: offline interaction, eligibility and responsive checks
  - routing-policy-workspace.mjs: shared-draft and unified-save integration
CHECKS:
  - Shell regression: PASS (30 files, 497/497, zero skipped)
  - UI typecheck/design/motion/contents/diff: PASS
  - Settled-state frame samples: PASS (73/72/72/72 frames)
  - Repository standards: BLOCKED (pre-existing independent submodule export)
CODE:
  > onClick={() => setView({ ...view, expanded: expanded ? null : key, focusNew: false })}
VALIDATION:
  APPROVED - score: 1.0, complete: true, missing: [] (UI scope only)
  retry_budget: 3 remaining: 1
```

## Model assignment naming (2026-11-16)

The user approved renaming the public routing-policy label to `模型分配`.
This is a guarded, reversible copy-only change; it does not authorize the proposed
Agent page, runtime routing groups, resource library or search integration.
Preserve the dirty worktree, existing draft/save behavior, route IDs, deep links
(`/routing/config` and `section=policy`), configuration and runtime routing.

Acceptance and test seams:

- Console navigation metadata, workspace entry, panel heading, task navigation,
  related settings/home/model-removal hints and the README use the approved name.
- Assert the navigation label/title through `CONSOLE_VIEWS`, and the visible
  heading/current workspace entry/accessibility name through the existing real
  isolated Console browser fixture. The old deep link must still open the panel.
- Keep existing default/client/intent and shared-save browser checks, with their
  selectors updated rather than weakened. No real client writes, paid calls,
  registry updates, original-service restart/stop, staging, commits or push.

The source baseline is `/tmp/model-assignment-rename-baseline.json` (2447 files).
Pre-edit safety audit passed; the original 3126 listener remains PID 97352.
Structural graph tools are unavailable; targeted source/caller/test inspection is
the bounded fallback. No new abstraction, runtime capability or schema is needed.

Verification:

- The label assertion first failed with `路由策略 !== 模型分配`; see
  `/tmp/model-assignment-rename-red.log`.
- `node /tmp/model-assignment-rename-run-tests.mjs`: **30 Shell files,
  497/497 passed, zero skipped/cancelled**, including the real isolated Console
  browser. All 2447 monitored inputs remained unchanged during the run. Evidence:
  `/tmp/model-assignment-rename-shell-tests-final.{log,json}` and
  `/tmp/model-assignment-rename-shell-inputs-final.json`.
- `npm run ui:typecheck`, `npm run check:design`, `npm run check:motion` and
  `git diff --check`: PASS (`/tmp/model-assignment-rename-gates.log`).
  Fresh 390px light and 1440px dark screenshots were visually reviewed under
  `/tmp/model-assignment-rename-artifacts/`.
- The directory-entries standards command still fails before measurement on
  missing `runStandardsArgs`; see `/tmp/model-assignment-rename-standards.log`.
  The full-repository suite was not rerun for this copy-only change; the historical
  32-failure baseline is not a fresh pass. The unavailable
  `verification-before-completion` symlink was handled with the local
  `verification-loop` evidence contract, without repairing skill installations.
- `/tmp/model-assignment-rename-source-audit-final.json` records the seven exact
  copy-only transformations, four test updates and this plan update relative to
  the pre-edit snapshot. Only this plan's evidence append follows the passing test
  snapshot. The final safety/syntax audit preserves the registry hash/size/mtime,
  original listener, backup filenames, HEAD/index and independent submodule state;
  49 modified/new MJS files pass syntax checks. No real-client mutation, paid call,
  original-service restart/stop, staging, commit or push occurred.

```text
VERDICT:
FILES_REVIEWED:
  - console-navigation.ts:1-33; gateway-workspace.tsx:25-30,235-246 (labels/copy)
  - routing-config.tsx:36-43; console-workspace.tsx:299-305 (heading/hint)
  - agent-overview.tsx:139-146; model-source-section.tsx:185-195 (entry/hint)
  - shell-labels.test.mjs:10-26; routing-policy-workspace.mjs:7-42 (new assertions)
  - gateway-workspace.mjs:40-175; model-source-workspace.mjs:40-46,214-220 (selectors)
CHECKS:
  - Isolated Shell regression: PASS (497/497, zero skipped/cancelled)
  - UI typecheck/design/motion/diff: PASS
  - Standards: BLOCKED (pre-existing submodule export); full repository: NOT RERUN
CODE:
  > routingConfig: { href: '/routing/config', label: '模型分配', title: '模型分配' },
VALIDATION:
  APPROVED - score: 1.0, complete: true, missing: [] (copy-only scope)
  retry_budget: 3 remaining: 3
```

## Approved client, routing, resources and search expansion (2026-11-17)

The user authorized completing all six previously listed optimizations, not only
renaming. This reuses the current work item and dirty source baseline; previous
intent editing and shared draft/save contracts remain acceptance requirements.

- type: implementation
- targets: Console clients/resources/gateway, model-router targets/groups/connect,
  client installation/update adapters, local DeepSeek Search/Fetch MCP
- allowedWrites: `apps/shell/`, relevant `scripts/lib/tooling/` and CLI entry
  adapters, `mcp-server/src/` only if the existing MCP owner requires it, focused
  tests and suite registration, this plan
- failureClass: wrong-target / configuration-loss / unsafe-update / credential-leak
- workflow_type: one-shot, attended, manual start; retry budget 3 per independent
  failure class, checkpoint each completed work item; do not repeat an unchanged
  failing command or repair unrelated baseline failures
- source baseline: `/tmp/gateway-all-optimizations-baseline.json` (5164 files)
- safety baseline: `/tmp/aios-gateway-protocol-local-safety-all-optimizations-before.json`

### Accepted behavior and boundaries

1. Upgrade the existing tools view to Agent clients rather than add a duplicate
   page. Show configuration, installation/version and gateway connection as
   separate facts. Updates must be installation-source-specific, explicit and
   confirmed; unknown/unsupported sources must not pretend to update.
2. Expose client-native default, fixed model, fixed routing group and AIOS Auto
   only where supported. Explicit targets bypass automatic role/intent choice;
   Auto invokes the existing assignment rules. Disconnect restores owned config
   and is distinct from clearing an explicit default. Client identity and model
   catalogs must be conveyed, not inferred from a display name.
3. Routing groups execute ordered preference plus safe pre-output failover;
   preserve conversation/tool-turn affinity, and never retry a stream after output
   is committed. Do not imply weights/cost/load balancing exists.
4. Default/role/client/intent target editors accept model or group, validate exact
   qualified targets, preserve old references and metadata, and share one draft.
5. Resource library consolidates existing MCP/skills/subagent management with real
   inventory, safe previews/confirmation and truthful unsupported/empty states.
   It is not a vector-document knowledge base; arbitrary hook execution is out.
6. Local MCP exposes DeepSeek Search/Fetch using a server-side environment key.
   It works independently of the generation model; it does not silently replace
   every client's native web tool. Fail closed on bad inputs, redact credentials,
   bound responses/timeouts, and test with fake HTTP only.

No actual client connect/update, secret reads, paid calls, registry/testgrp edits,
submodule edits, original 3126 service restart/stop, staging, commits or push.
Structural graph tools are not exposed; use bounded source/caller/test searches.
`rex-harness` is not on PATH; the repository's public CLI was invoked read-only
with respect to its source. Start returned completed with command=null and no
missing evidence (activation f1baa8c7-da04-4b16-8377-755338fe4a83), so no Provider
or activation evidence is fabricated. Workflow completion is not product success.

### Dependency and verification ledger

| Work | Depends on | Observable outcome / completion | Verification / recovery |
| --- | --- | --- | --- |
| work-1 | none | Qualified explicit targets and real ordered groups resolve and safely fail over | Pure router + isolated loopback JSON/SSE/tool-turn tests; retain old model-only config |
| work-2 | work-1 | Model/group/Auto catalogs and per-client defaults are actually honored | Temp client config connect/readback/restore and explicit gateway requests; original files untouched |
| work-3 | none | Client version/source inventory and confirmed supported-source update adapters | Injected executable/process fixtures; no actual updates |
| work-4 | work-1 | Shared draft model/group assignments and editable group UI round-trip | Adapter/API plus offline and real isolated Console browser; keep existing intent focus/draft tests |
| work-5 | work-2, work-3 | Agent client view manages connection, defaults and version/update capabilities | Isolated Console actions, confirmation/failure/unsupported tests; preserve gateway process separation |
| work-6 | none | Resource library reuses real MCP/skills/subagent inventory and actions | Temp resource inventory/action/preview tests and Console browser |
| work-7 | none | Installable local MCP Search/Fetch with safe DeepSeek HTTP adapter | Offline stdio JSON-RPC + mock HTTP, key redaction/error/timeout tests |
| work-8 | work-4, work-5, work-6, work-7 | All features converge with documentation and known limits | Isolated focused, Shell, expanded/full regressions, type/build/design/motion/syntax and safety audits |

Frontier: work-1/work-3/work-6/work-7 ready; work-2/work-4/work-5/work-8 blocked
only by the dependencies above. Independent exploration may run concurrently;
write ownership must not overlap. Convergence requires public behavior tests, not
only mock dropdowns. Keep old 32 repository failures and standards export blocker
separate from new regressions. Hard completion requires actual runtime/catalog/
client/API/MCP consumers tested with isolated fixtures; no real paid acceptance is
claimed. Current ledger: is_complete=false; all work items pending.

### Expansion convergence checkpoint (2026-11-17; not final acceptance)

This entry supersedes the initial all-pending frontier, not the historical test
counts above. Implementation is present for work-1 through work-7. Work-8 remains
open until the implementation owners freeze and the combined suites finish.

- Runtime target migration now preserves array-valued metadata and handles only
  assignment-schema fields. `assignmentReferences()` is the CLI deletion guard's
  authority, with UI/runtime parity tests. Parser -> command -> connect tests
  exercise exact `expectedRevision`, stale/invalid/empty rejection before writes,
  both inplace and isolated artifacts, and seeded snapshots with no writes.
  Targets/groups focused run: 102/102 in
  `/tmp/gateway-cli-revision-green.log`.
- Group CLI handlers were extracted into `entry/group-commands.mjs` (48 lines),
  reducing `entry/command.mjs` from 427 to 386 lines without changing parameters,
  output or revision locks. Targets/groups/concurrent registry writers: 132/132,
  `/tmp/gateway-group-entry-extraction.log`.
- Temp-home client artifact/readback/ownership/recovery coverage previously
  passed 156/156 (`/tmp/work2-connect-final-verified.log`), before the parser
  revision change. This is not the final combined connect count.
- Agent/resources isolated browser: 23 Agent and 7 resource/Search leaf cases,
  31/31 Node tests including wrapper. Components/intent/Agent model: 38/38;
  successful invocations total 69/69 Node tests, 66 leaf cases, no skips.
  Logs: `/tmp/gateway-clients-resources-{focused,components}-final.log`.
  `/tmp/gateway-clients-resources-evidence/` contains 30 PNGs and 30 JSON records:
  zero page errors, warnings, hydration warnings or escaped requests; ten expected
  HTTP errors match injected 409/503 failures. API writes are fixtures here, not
  proof of real client-file or paid Search execution.
- The production parser/command/server lifecycle now uses an explicitly injected
  temporary registry, child environment, home and state. Start -> running status
  -> stop -> closed port passed, together with 14 lifecycle unit tests: 15/15 in
  `/tmp/gateway-lifecycle-complete-isolated.log`. This tests a generated isolated
  CLI entry importing the production parser/command, not the default installed
  CLI's registry resolution. The original port 3126 is never selected.
- MCP owner delivered opaque one-shot approval -> server revision -> CLI env ->
  config/ledger transaction plus actual wizard confirmation and refresh. Four
  tests moved from `tooling/shell/mcp/` to `tooling/clients/mcp/`; manifest paths
  are updated rather than registering obsolete paths. Wiring pre-freeze: 6/6 in
  `/tmp/gateway-wiring-pre-freeze.log`; rescan required after final new tests.

#### Audit feedback and approved recovery

The independent MCP audit passed its original 41 focused checks but exposed five
failing supplemental assertions: three ledger-failure compensation cases that
overwrote/deleted external config edits, one lost external ledger record, and one
backup permission check. Evidence: `/tmp/mcp-security-review.AYSpn3/`.
Those failures are real defects, not waived by the previous green tests.

The audit detected a concurrent implementation-owner change. Parent stopped
editing and asked the user. The user explicitly selected continuing from the
current snapshot; the implementation owner then completed and handed off.
`/tmp/gateway-post-owner-approved-baseline.json` records the accepted 5250-file
snapshot. The auditor now has exclusive write ownership of the MCP runtime
compensation/ledger/backup code and focused safety test. Other owners cannot edit
those files. Required fix: byte-checked compensation and ledger commits, private
collision-safe backups, truthful incomplete recovery, no OS-level CAS claim.

The broad browser run also exposed three obsolete bare-ID expectations and a
real saved-role-profile apply failure. A separate owner is repairing canonical
target/version compatibility while retaining literal legacy IDs. Its result must
be checked in the complete browser run; the earlier 52/59 is not acceptance.

The UI config adapter reached 841 lines. A separate owner is extracting cohesive
pure domain modules behind its existing public facade, without changing runtime
semantics or introducing a second target grammar. Budget measurements and final
suite registration are pending that frozen handoff. Standards still fails before
measurement on missing `runStandardsArgs`; manual size facts are not a gate pass.

### Convergence fixes handed off (2026-11-17; combined rerun pending)

- MCP safety owner froze the runtime fixes: compensation compares committed
  bytes before restoring/removing; default ledger saves check exact read bytes
  before rename; backups are UUID-named, exclusive `wx`, mode `0600`. Shared
  `environment/fs/checked-atomic-write.mjs` performs the final check and rename
  without an intervening await and does not clean up a successful commit as a
  failure. No OS-level CAS claim is made. Security RED: 11/22 failed; cleanup-edge
  RED: 1/23 failed; final focused GREEN: 23/23; expanded GREEN: 113/113, no skips.
  Evidence and hashes: `/tmp/mcp-security-fix.OiOPLN/`. Safe API projection of
  `rollback-incomplete`/recovery is being completed in the separately owned
  action service, without exposing arbitrary CLI text or entry records.
- The UI adapter extraction is frozen: facade 311 lines, five routing modules
  11/80/135/103/225 lines, config directory 7/8 and routing 5/8. All 20 exports,
  35 function/class implementations and seven non-function values preserve
  parity; shared `ConfigError` identity and acyclic local dependency graph are
  checked. Expanded isolated adapter run: 355/355. Evidence:
  `/tmp/aios-routing-parity-evidence.json`, `/tmp/aios-routing-final-tests.log`.
- Legacy GatewayControl now captures revision and port at confirmation, including
  the displayed destination. GET exposes `configuredRevision` or null on config
  failure; POST requires a lowercase 64-hex revision on every connect, before any
  CLI work. Disconnect remains independent of config revision and read failures.
  API RED rejected missing revision (1/8 failed); GREEN 8/8 includes invalid,
  missing, explicit model/group, isolated, exact argv and unavailable config
  cases: `/tmp/gateway-api-revision-{red,green}.log`.
- Registered the new `groups/routing-profiles.test.mjs`. Its caller target catalog
  and actual group/Auto browser scenario are undergoing the owner's final run;
  earlier model-only profile results are not substituted for that evidence.

Raw budget facts are in `/tmp/gateway-expansion-budget-facts-final.json`, not an
official disposition: console root 10 -> 13 entries; UI data 8 -> 10;
model-routing 9 -> 10. Existing gateway/model-router roots stay 9 -> 9.
Three protocol compatibility modules remain around 1010/601/872 lines and the
pre-existing client integration installer is 464 lines. The extraction avoids
growing the 841-line UI adapter and the 427-line command facade. Broadly relocating
Console workspaces or rewriting protocol codecs is deferred rather than mixed
into these security/behavior fixes. These remaining budget overages and the
unavailable official standards entry prevent an all-standards-green claim.

#### Second bounded safety review

A fresh, read-only independent review verified the MCP owner's runtime hashes and
found three further P2 paths by source reasoning (not yet executed reproductions):
stream-local generated Gemini tool IDs can collide across conversations; native
Chat affinity observes ID fragments instead of their assembled call ID; a corrupt
or future-version ledger can be treated as empty and replaced on a new install.
The existing green tests do not close these paths. The reviewer owns the two
stream/affinity fixes and narrow regression tests; the MCP safety owner owns
fail-closed ledger handling after finishing its projection. No write scopes
overlap. Required acceptance is a RED reproduction followed by GREEN, then a new
frozen handoff and combined rerun; no remaining unknown is converted to an assumed
pass. The initial isolated static preflight passed type/build/design/motion/
contents/syntax/whitespace; standards still fails on the missing public export.
Those preflight results precede the final fixes and will be rerun.

The stream/affinity owner has frozen four files. Generated missing Gemini tool
IDs now retain the `call_gateway_` prefix but use per-call UUIDs, and native Chat
ID fragments accumulate by tool-call index with 256-tool/512-character bounds.
Invalid/overflowing metadata never publishes affinity; wire bytes and
successful-EOF-only publication are preserved. Actual SSE -> JSON continuation
tests cover separate conversations with and without session headers. RED:
216/226 passed, 10 failed; GREEN: 226/226, plus the unchanged retry/output-commit
suite 28/28, with no skips. `/tmp/gateway-affinity-12.3RBhzj/` holds RED/GREEN,
attempt-suite and four-file frozen hashes. Parent checked all four hashes after
handoff. The compatibility directory remains seven files; no helper was added.
Parent additionally required a narrow collision guard for provider-supplied tool
IDs: UUID generation cannot make an upstream `call_1` globally unique. Reusing an
ID for an incompatible route/account/target/fingerprint must fail closed rather
than replace its earlier pin. The same affinity owner has exclusive ownership of
that two-file follow-up and its RED/GREEN regression; the final combined run waits
for the replacing freeze manifest.

The MCP owner reproduced the remaining invalid-ledger path and froze the fix.
Malformed JSON, v2/invalid schemas, array-valued entries and unsupported records
now remain read-only diagnostics. Install/remove/adopt policy refuses before
config/backup writes (`ledger-invalid`); direct record/release/verify/save helpers
reject `MCP_LEDGER_INVALID`, even if a caller clears the public corruption marker.
The actual action-service -> CLI test obtains no safe approval for these ledgers.
RED: 23 passed/24 failed; final regression against an import-only baseline shadow:
23 passed/25 failed. GREEN safety 48/48; action/API/safety 78/78; expanded
MCP/writer/ownership/CLI 160/160, zero skips. Evidence and replacement hashes:
`/tmp/mcp-ledger-invalid.XIoXX0/`. Parent verified all three replacement and four
preserved hashes. Safe recovery projection is also frozen at
`/tmp/mcp-recovery-projection.aA2MnY/frozen.sha256`: `rollback-incomplete` is
retained, recovery reasons are allowlisted and paths must match the existing
landing/backup fields, with no arbitrary CLI text or ownership records exposed.

Role-profile caller integration and legacy-control coverage are now frozen in
`/tmp/gateway-routing-profiles-freeze.json`. `PolicyTools` supplies canonical
`routing.targets` IDs. Actual Console tests exercise model/group/Auto save/apply,
legacy literal IDs and atomic rejection of malformed/unavailable references.
Integration RED: three passed/two failed (including wrapper); focused GREEN 5/5.
Legacy control GREEN 9/9 proves captured revision/port survive polling replacement,
stale confirmation rejects, invalid/missing hashes and refresh errors block
connect while disconnect remains available. Final complete Console browser:
70/70; profile/group/policy 87/87, no skips. Parent verified 19/19 owned, frozen
browser and parent-input hashes; ten non-parent browser inputs remain unchanged.
The new browser helper is imported by the registered suite, not a disconnected
test. Final registration reachability scan: 6/6 in
`/tmp/gateway-wiring-frozen.log`.

Provider-supplied tool ID collision follow-up is frozen at
`/tmp/gateway-supplied-affinity.26tFsl/`. Incompatible reuse stores a collision
tombstone and continuations reject `AFFINITY_TARGET_CONFLICT`, regardless of
session, across all four protocols. Compatible same-pin reuse stays valid;
later writes cannot clear the tombstone. Existing TTL/LRU bounds still apply.
RED 254/275 passed with 21 failures; GREEN 275/275 includes all 254 prior
stream/affinity/attempt cases and 21 supplied-ID collision/TTL/eviction cases.
No skips, network, listeners or new helper. The two prior protocol-stream hashes
are unchanged. Parent independently reran MCP expanded acceptance: 160/160,
`/tmp/gateway-mcp-parent-final.log`. All implementation owners have now frozen.

Final combined acceptance is launched from this input snapshot with
`node /tmp/gateway-expansion-final-pipeline.mjs frozen-final`. It runs migration,
Shell, expanded runtime/native, full regression, isolated type/build and static
checks, then exact baseline-failure comparison and original-service/local-state
safety audit. Per-run input manifests and drift reports must show no changes;
no source/test/doc edits are allowed until the pipeline exits. This launch
record is not a passing result.

### First frozen combined run: failed, then bounded corrections

The `frozen-final` pipeline exited 1. All four stages used identical 2,545 source
inputs, with no in-stage or between-stage drift. Migration passed 265/265. Shell
reported 687 passed/8 failed; expanded runtime/native 1,519 passed/4 failed;
regression 4,383 passed/41 failed/15 skipped (4,439 tests). Type/build/design,
both motion checks, release contents, syntax and whitespace passed; standards
still failed before measuring because `runStandardsArgs` is unavailable. Build
retains six dynamic-filesystem tracing warnings. Original listener PID 97352,
registry bytes/size/mtime, backups, HEAD/index and independent submodule were
unchanged; modified-MJS syntax audit passed 156 files.

The historical comparison initially stopped because Node's spec footer omits
three failed parent containers while its total includes them. The replacing
`/tmp/gateway-expansion-compare-regression.mjs` accounts for every inline and
footer failure, requires an unambiguous source location for omitted parents,
and self-checks the historical 32 identities without differences. It reports
all 32 historical failures retained, none removed, plus nine added identities:
six leaf failures and their three failed containers. Evidence:
`/tmp/gateway-expansion-regression-frozen-final-comparison.{json,log}`. Initial
static logs are preserved in `/tmp/gateway-expansion-static-frozen-final-archive/`.

Bounded follow-up, without weakening assertions or changing production contracts:

- API target/runtime readiness test now submits a valid required revision before
  expecting runtime errors, and explicitly checks missing revision rejection.
  The overview layout fixture supplies a valid config hash/configuredRevision;
  its enabled-state and pixel-stability assertions are unchanged. These two
  files pass 12/12 in `/tmp/gateway-frozen-contracts-green.log`.
- Search browser checks capture the actually selected writable Claude landing
  (`user` in isolated seed facts, `home` in the real development facts) and require
  the exact request to match it, rather than assuming a user-only scope. Secret,
  cancel, preview-ID, revision and explicit-confirmation checks remain. The
  Agent/resource Console combination passes 31/31, no skips:
  `/tmp/gateway-resource-scope-green.log`. The real-development combination must
  still be rerun after the new freeze.
- Console header age formatting reads `Date.now()` during SSR and initial client
  render, producing actual cross-minute hydration errors. The UI owner has a
  narrow source/test unlock for deterministic hydration with truthful post-mount
  age updates; warnings must not be suppressed or ignored. Handoff is pending.
- The installer and release test both exactly matched the pre-expansion baseline
  and HEAD. The installer correctly honors documented `AIOS_STATE_DIR`; the test
  accidentally inherited the acceptance runner's isolated override while
  asserting the no-override default. Its child env now explicitly clears that
  variable, leaving all hostile runtime inputs and exact path assertions intact.
  Installer runtime is unchanged. The scratch/local-file-only focused case
  passes 1/1: `/tmp/gateway-release-isolation-green.log`.

The failed frozen run remains failed evidence, not substituted by focused GREEN.
After the hydration handoff, freeze all inputs again and rerun the entire serial
pipeline under a new tag, including exact 32-failure identity comparison.

The hydration follow-up is frozen in `/tmp/gateway-hydration-freeze.json`. Only
`console-workspace.tsx` and new `browser/console-hydration.test.mjs` are owned:
SSR/first-client display the supplied timestamp; a local age component samples
the live clock after mount and every second, cleaning up on unmount. Actual
SSR/hydrateRoot tests cross real second/minute boundaries without freezing the
clock, verify initial text and node retention, periodic updates, fresh facts and
StrictMode cleanup. RED 0/2, GREEN 2/2 and independent repeat 2/2; full isolated
Console 70/70, with 69 clean leaf artifact records. Parent verified 21/21 frozen
source/test/input hashes. Registered the new test in regression; reachability
remains 6/6 (`/tmp/gateway-wiring-recheck.log`). Exact commands and evidence:
`/tmp/gateway-hydration-commands.json`, `/tmp/gateway-hydration-{red,green,repeat,
console}.log`, `/tmp/gateway-hydration-evidence-summary.json`.

All owners are frozen again. Second full serial acceptance starts with
`node /tmp/gateway-expansion-final-pipeline.mjs frozen-recheck`, preserving the
failed first run and using the corrected exhaustive failure-identity comparator.
No source/test/doc edits until it exits. This launch is not a pass.

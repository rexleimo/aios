# AIOS Token Intelligence Stack Design

Date: 2026-07-10
Status: approved for planning
Scope: install and compose Headroom, RTK, Caveman, ContextDB, and a Ponytail-inspired decision gate without restoring the deprecated AIOS interception runtime

## Goal

Make token reduction automatic in AIOS-managed sessions while improving implementation judgment instead of merely making responses shorter.

The stack has five non-overlapping responsibilities:

| Layer | Responsibility |
| --- | --- |
| Ponytail Gate | Avoid unnecessary code, dependencies, abstractions, and files. |
| RTK | Reduce shell and tool output before it enters agent context. |
| Headroom | Compress model input, preserve provider-cache stability where possible, and keep originals retrievable. |
| Caveman | Reduce assistant response verbosity without deleting technical facts. |
| ContextDB | Keep historical context pull-based, budgeted, and selectively recallable. |

Superpowers, TDD, CRG, privacy checks, and verification remain quality and safety controls around this stack. Compression must never replace them.

## External Sources and Adoption Decision

Primary sources reviewed on 2026-07-10:

- Ponytail: <https://github.com/DietrichGebert/ponytail>
- Headroom: <https://github.com/headroomlabs-ai/headroom>
- RTK: <https://github.com/rtk-ai/rtk>
- Caveman: <https://github.com/JuliusBrussee/caveman>
- User-provided Grok discussion: <https://grok.com/share/bGVnYWN5LWNvcHk_b8994159-cbea-4fab-b42d-e41ad375f825>

Decision: **Compose and extend**.

- Adopt the maintained RTK, Caveman, and Headroom distributions rather than rebuilding their data planes.
- Extend AIOS installation and launch boundaries with a thin, testable adapter.
- Adapt Ponytail's decision ladder into an AIOS-native skill instead of injecting the complete upstream ruleset on every turn.
- Attribute Ponytail and preserve its safety exclusions; do not claim official-plugin installation or behavioral parity unless the official plugin is installed and smoke-tested separately.

The published upstream savings figures are reference claims, not AIOS-local evidence. AIOS documentation must label them as upstream benchmarks until its own controlled measurements exist.

## Architecture

```text
User task
  -> Superpowers understanding and planning
  -> CRG / project search / search-first evidence
  -> pre-edit context, impact, dependency, style, and test checks
  -> AIOS Ponytail Gate selects the earliest valid solution rung
  -> TDD implementation
  -> RTK shrinks shell/tool output
  -> Headroom shrinks model input and retains retrieval paths
  -> Caveman shrinks response style
  -> Ponytail diff review removes avoidable implementation
  -> verification preserves exact evidence
```

The control plane and data plane stay separate:

- Control plane: workflow routing, Ponytail Gate, ContextDB selection rules, safety gates, documentation, and capability reporting.
- Data plane: RTK command filtering, Headroom request proxying, and the provider's normal model transport.

AIOS does not revive `scripts/aios-intercept.mjs` or `scripts/aios-mcp-proxy.mjs`. Those files remain deprecated reference code.

## Installation Contract

`aios init` is the only automatic installation boundary.

Existing entrypoint:

```bash
node scripts/aios.mjs init --all
```

Unattended entrypoint:

```bash
node scripts/aios.mjs init --all --yes-compression-tools
```

The current `ensureCompressionTools()` flow becomes a three-tool result contract:

```js
{
  rtk: 'installed|missing|failed',
  caveman: 'installed|missing|failed',
  headroom: 'installed|missing|unsupported|failed'
}
```

Installation order:

1. Detect all three tools without modifying the machine.
2. Display one consent notice describing downloads, local processing, optional model assets, and network endpoints.
3. Install RTK using the existing platform strategy.
4. Install Caveman using the existing platform strategy.
5. Install Headroom in an isolated Python tool environment.
6. Verify exact tool availability and versions.
7. Initialize RTK for detected clients.
8. Report each tool independently; one failed optional layer must not be presented as full-stack success.

Headroom installation strategy:

1. Require Python 3.10 or newer.
2. Prefer `uv tool install "headroom-ai[all]"`.
3. Fall back to `pipx install "headroom-ai[all]"` when `uv` is unavailable.
4. Do not silently install into the active system Python environment.
5. When neither isolated tool manager is available, report `unsupported` with exact manual commands rather than changing the user's Python environment.
6. Verify with `headroom --version`; run a bounded readiness/doctor check that does not require changing provider configuration.

`--dry-run` reports what would be installed and which prerequisite is missing. It never downloads packages, models, or binaries.

The consent text must state:

- RTK and Caveman run locally.
- Headroom runs as a loopback proxy by default.
- Installation can access package registries, GitHub releases, and optional model-asset hosts documented by Headroom.
- Model requests still go to the user's configured LLM provider through the local proxy.
- `--yes-compression-tools` is explicit unattended consent for all three tools.

## Headroom Runtime Contract

Installing Headroom does not route traffic by itself. Routing happens only when AIOS launches a supported client through its shell bridge, `ctx-agent`, team runtime, or harness runtime.

A focused runtime adapter owns this behavior:

```text
scripts/lib/headroom/
  config.mjs       # environment/config parsing and defaults
  runtime.mjs      # health probe, start/reuse, bounded readiness wait
  providers.mjs    # per-client environment mapping and capability table
```

Shared runtime state lives outside the repository at
`~/.aios/runtime/headroom.json`. It records only non-secret lifecycle data:
PID, port, executable path, mode, start time, and log path. Startup uses a
user-scoped lock so concurrent AIOS sessions cannot launch duplicate proxies.
The proxy remains available for reuse after an individual agent exits.

Lifecycle commands are explicit and idempotent:

```bash
node scripts/aios.mjs compression status
node scripts/aios.mjs compression start
node scripts/aios.mjs compression stop
```

`stop` may terminate only the PID recorded as AIOS-owned after verifying that
the process and readiness endpoint still identify the managed Headroom proxy.
It must not terminate an externally managed Headroom instance merely because
it uses the configured port.

Default configuration:

| Setting | Default | Meaning |
| --- | --- | --- |
| `AIOS_HEADROOM` | `auto` | Use Headroom when installed and the client adapter is verified. |
| `AIOS_HEADROOM_PORT` | `8787` | First loopback port to probe. |
| `AIOS_HEADROOM_MODE` | `token` | Prefer actual input-token reduction. |
| `AIOS_HEADROOM_START_TIMEOUT_MS` | `45000` | Bound cold startup and model initialization. |
| `HEADROOM_OUTPUT_SHAPER` | unset/off | Caveman owns output brevity by default, avoiding duplicate shaping. |

Accepted `AIOS_HEADROOM` values:

- `auto`: start or reuse Headroom for verified client adapters; degrade cleanly when absent.
- `on`: require Headroom; fail the managed launch with an actionable message if it cannot become healthy.
- `off`: bypass Headroom and retain RTK, Caveman, and ContextDB behavior.

Runtime sequence:

1. Resolve whether the client has a verified adapter.
2. Probe `http://127.0.0.1:<port>/readyz` with a short timeout.
3. Reuse a healthy Headroom proxy.
4. If the port is occupied by a non-Headroom service, select a bounded fallback port rather than taking over the process.
5. If no proxy is healthy, start `headroom proxy --host 127.0.0.1 --port <port> --mode <mode>` as a detached local process with logs outside the repository.
6. Wait up to `AIOS_HEADROOM_START_TIMEOUT_MS` for readiness.
7. Inject proxy variables into the launched child process only.
8. Never rewrite the user's global provider configuration as part of normal AIOS launch.

AIOS must not call `headroom wrap <client>` from inside its existing wrapper. That would create nested lifecycle ownership and can mutate global client configuration that AIOS does not own.

Initial verified provider adapters:

| AIOS runtime | Child-process configuration | Rollout state |
| --- | --- | --- |
| `codex-cli` | `OPENAI_BASE_URL=http://127.0.0.1:<port>/v1` | Implement and smoke-test first. |
| `claude-code` | `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` and `ENABLE_TOOL_SEARCH=true` | Implement and smoke-test first. |
| `opencode-cli` | No default routing until its no-global-mutation launch contract is verified. | Capability-gated. |
| Gemini, Hermes, Grok | No proxy environment assumption. | RTK/Caveman/ContextDB only until smoke evidence exists. |

This matrix is deliberately conservative. Upstream documentation that says an agent is supported does not prove that AIOS's non-mutating launch adapter is correct.

### Failure Behavior

In `auto` mode:

- Missing Headroom: warn once per launch and continue without it.
- Unhealthy proxy: preserve the first actionable error and continue without it.
- Port collision: use a bounded fallback port.
- Readiness timeout: terminate only the proxy process AIOS started, then continue without it.
- Existing custom provider base URL: do not overwrite it silently; report the conflict and bypass Headroom.

In `on` mode, the same conditions stop the managed client launch with a non-zero exit code and exact remediation.

No failure path may expose API keys, authorization headers, cookies, or complete provider configuration in logs.

## Ponytail Gate Contract

Create one canonical skill:

```text
skill-sources/aios-ponytail-gate/SKILL.md
```

The normal skill synchronization pipeline projects it to supported client roots. The skill is loaded on implementation/refactor/fix tasks, not on every conversational turn.

It runs only after the agent understands the task and has inspected the relevant flow. The decision ladder is:

1. Skip: the requested artifact or behavior is unnecessary.
2. Reuse: an existing repository helper, pattern, or command already solves it.
3. Standard library: the language runtime already solves it.
4. Native platform: the operating system, browser, framework, or protocol already solves it.
5. Installed dependency: an existing dependency solves it without adding another package.
6. Direct expression: a clear one-line or small direct expression is sufficient.
7. Minimal implementation: write only the smallest new implementation that satisfies the approved design and tests.

The gate outputs one compact decision record:

```text
ponytail:rung=<1-7> choice=<skip|reuse|stdlib|native|dependency|direct|minimal> evidence=<path-or-symbol>
```

That record is written to the active task's decision note or plan decision log
when a plan exists. It must not be added to the plan's verification evidence
array: a solution-choice record is not proof that implementation or tests pass.
It is not repeated in every user-facing progress message.

### Safety Exclusions

The gate cannot remove or weaken:

- trust-boundary input validation;
- authentication, authorization, or secret handling;
- error handling that prevents data loss;
- accessibility requirements;
- concurrency and lifecycle cleanup needed for correctness;
- user-requested compatibility behavior;
- regression tests and completion evidence.

Shortest code is not the objective. The objective is the smallest correct change at the correct abstraction boundary.

### Workflow Integration

Update canonical workflow skills, then sync generated roots:

- `aios-workflow-router`: route implementation, refactor, and bug-fix work through the Ponytail Gate after problem understanding.
- `pre-edit-safety-gate`: require a Ponytail decision record after context/dependency/style/test checks and before production edits.
- `search-first`: treat a reusable local implementation as rung 2 and an ecosystem dependency as rung 5; search evidence remains mandatory before choosing either.
- `verification-loop`: add a post-edit minimal-diff review without relaxing its evidence schema.

Do not copy the entire Ponytail repository into AIOS. Do not install the official Ponytail plugin by default. The official plugin remains an optional user-managed enhancement because its lifecycle hooks can overlap AIOS-managed hooks.

## Post-Edit Minimal-Diff Review

Before completion, review the actual diff and answer:

1. Did the change add an abstraction not required by more than one real caller?
2. Did it add a dependency when a lower ladder rung was available?
3. Did it touch files unrelated to the accepted behavior?
4. Can duplicated logic be replaced with an existing shared function?
5. Did simplification remove a safety exclusion or change branch semantics?

Deletion is accepted only when tests and verification show the deleted behavior is unnecessary. A smaller diff with missing behavior is a regression, not a Ponytail success.

## Metrics and Claim Honesty

AIOS should expose three categories separately:

- Measured input savings: values reported by RTK and Headroom from actual processed input.
- Estimated output savings: Headroom/Caveman estimates must be labelled estimated unless a holdout or before/after measurement exists.
- Implementation economy: changed LOC, files touched, and dependencies added, compared only within a controlled benchmark.

Do not add savings from different layers as if they shared the same denominator. Do not claim safety or reasoning improvements from token counts alone.

The first rollout needs deterministic tests and smoke evidence, not a target percentage.

## Documentation Deliverables

Update:

- `README.md` and any maintained localized overview that still describes deprecated native compression.
- `docs-site/token-compression.md` plus maintained localized versions.
- `docs-site/changelog.md` plus maintained localized versions.
- A new English and Chinese blog article explaining the layered stack, privacy boundary, startup behavior, and rollback controls.
- The canonical compression skill documentation so RTK, Caveman, Headroom, ContextDB, and Ponytail Gate have distinct responsibilities.

Documentation must include:

- automatic and dry-run installation commands;
- `AIOS_HEADROOM=auto|on|off` examples;
- supported-client matrix;
- health/failure troubleshooting;
- upstream benchmark attribution;
- clear distinction between local processing and upstream model-provider traffic;
- rollback instructions that do not delete user credentials or client profiles.

## Test Strategy

Implementation follows TDD. Required test groups:

### Installer tests

- Detect an existing Headroom executable.
- Choose `uv tool`, then `pipx`, without falling into system Python.
- Return `unsupported` for Python older than 3.10 or missing isolated installers.
- Keep `--dry-run` side-effect free.
- Include Headroom in consent and summary output.
- Preserve existing RTK client initialization mappings.

### Runtime adapter tests

- Reuse a healthy loopback proxy.
- Start Headroom on an available port and wait for readiness.
- Avoid a non-Headroom port occupant.
- Time out deterministically and clean up only the process AIOS started.
- Serialize concurrent starts and persist only non-secret lifecycle state.
- Stop only a verified AIOS-owned proxy PID; preserve externally managed instances.
- Preserve an existing custom provider base URL.
- Inject correct Codex and Claude child environments.
- Respect `auto`, `on`, and `off` failure semantics.
- Redact sensitive environment values from logs and errors.

### Ponytail Gate tests

- Skill frontmatter and catalog metadata validate.
- Canonical skill sync produces identical generated content.
- Workflow router and pre-edit gate reference the canonical skill name.
- Training/evaluation cases distinguish safe simplification from missing validation, branch collapse, or test removal.

### Repository verification

At minimum:

```bash
npm run test:scripts
node scripts/check-skills-sync.mjs
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
node scripts/aios.mjs clients doctor --json
node scripts/aios.mjs init --all --dry-run
```

If `mcp-server` behavior is touched:

```bash
cd mcp-server
npm run typecheck
npm run test
npm run build
```

Live support claims require a no-secrets smoke session for each enabled provider adapter. File existence or unit tests alone are insufficient.

## Rollout

1. Add Headroom install detection and tests without enabling runtime routing.
2. Add the runtime supervisor and Codex adapter behind `AIOS_HEADROOM=on`.
3. Pass Codex live smoke, then make `auto` the default for verified installs.
4. Repeat for Claude with tool-search preservation.
5. Add and train the Ponytail Gate, then wire it into canonical workflow skills.
6. Sync client skill roots and run client capability/agent smoke checks.
7. Publish documentation, blog posts, and changelog only with the verified support matrix.

## Non-Goals

- Reimplement Headroom, RTK, or Caveman internals.
- Restore the deprecated AIOS native interception proxy.
- Modify user global provider configurations during normal launch.
- Enable unverified clients because upstream marketing lists them.
- Enable Headroom output shaping by default while Caveman already owns response brevity.
- Treat fewer tokens, fewer lines, or fewer files as proof of correctness.
- Auto-install the official Ponytail plugin or its lifecycle hooks.

## Acceptance Criteria

The implementation is ready only when:

- `aios init` detects, consents, installs, and independently reports RTK, Caveman, and Headroom.
- Headroom is never installed during shell/client startup.
- AIOS-managed Codex and Claude launches can start or reuse a healthy loopback proxy without persistent provider-config mutation.
- `AIOS_HEADROOM=off` returns launches to the existing RTK/Caveman/ContextDB path.
- The Ponytail Gate is canonical, synced, trained, and invoked at the correct workflow point.
- Safety exclusions and completion evidence remain intact.
- Documentation, blog, changelog, and capability claims match fresh test and smoke evidence.

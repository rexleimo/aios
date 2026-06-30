# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

## [3.1.0] - 2026-06-30

- feat: Hermes Agent as first-class AIOS client with MCP bridge + multilingual docs

### Added
- feat(clients): register Hermes Agent (Nous Research) as 7th first-class AIOS client with skills, native, harness, and superpowers capabilities
- feat(mcp): add `scripts/aios-mcp-server.mjs` — MCP bridge server exposing 5 AIOS tools (aios_context_pack, aios_doctor_suite, aios_intercept_compress, aios_skill_validate, aios_skill_install) for Hermes sessions
- feat(native): add Hermes native emitter (AGENTS.md output) and MCP target (JSON stdio, .mcp.json + config.yaml scopes)
- docs: add Hermes Agent + AIOS blog post and changelog coverage in English, Chinese, Japanese, and Korean

## [3.0.0] - 2026-06-15

### Added
- Make markdown agent role cards canonical across exported agent surfaces.
- Add agent governance rollout documentation for workflow routing, smoke validation, and skill training gates.
- Add website and blog guidance for the agent governance rollout.

### Fixed
- Preserve original subagent prompt semantics when turn compression offloads large prompt refs.
- Deep-merge OpenCode AIOS command/config buckets during native sync so user-defined commands are retained.
- Reject unsafe session and skill identifiers before writing runtime paths or health reports.

## [2.0.2] - 2026-06-15

### Fixed
- Validate skill health observation statuses at write time so producer typos fail fast instead of being persisted as failures.
- Honor `--help`, `-h`, and `help` before positional validation for `aios skill` and `aios session` subcommands.

### Changed
- Remove tracked `.crush.json` and `crush.json` from the repository; local Crush config copies are now ignored by git.

### Docs
- Add v2.0.2 release notes to docs and blog sources and rebuild the generated website output.

## [2.0.1] - 2026-06-13

- fix browser MCP legacy alias migration

## [2.0.0] - 2026-06-12

- remove automatic ContextDB prompt injection and startup-mode inject

## [1.53.0] - 2026-06-12

- enforce AIOS primary agent for OpenCode

## [1.52.1] - 2026-06-11

- fix MCP proxy wire compatibility for strict clients

## [1.52.0] - 2026-06-11

### Added
- feat(shell): add `aios_shell` MCP tool (`scripts/shell-mcp-server.mjs`) with output compression via MCP proxy for deterministic shell interception across all clients
- feat(shell): register `aios-shell` alias in all 9 client configs via `doctor --fix` (`.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`, `crush.json`, etc.)
- feat(shim): add self-healing to native shims — probe common AIOS install paths, fail-open by exec-ing real client binary when bridge is unreachable
- feat(shell): add host permission review guard for sensitive commands (`git push`, `npm publish`) in command rewrite

### Changed
- feat(strict): enhance native strict mode to verify real downstream client exists behind managed shim
- feat(rewrite): block dangerous shell constructs in command rewrite (`\n`, `\r`, single `&`)
- feat(hook): Claude PreToolUse hook no longer forces auto-allow; uses envelope-based command wrapping
- chore(deps): upgrade `proxy-inspector.mjs` to check managed MCP aliases (`mcp-browser-use`, `aios-shell`)

### Fixed
- fix(shim): prevent stale temp-directory fallback (`/var/folders/...`) in native shims when `AIOS_ROOT_DIR` is unset

## [1.51.0] - 2026-06-10

- feat(clients): add crush smoke verification and harden pending-smoke gating

## [1.50.3] - 2026-06-09

- refactor(skills): merge skills-catalog.json into skills-sync-manifest.json as single data source for skill discovery and sync
- fix(release): include .crush/skills and .crush/agents in release package

## [1.50.2] - 2026-06-09

- feat(skills): add pre-edit-safety-gate skill with CRG-backed edit safety enforcement, routing, and native AGENTS.md injection for all 7 client surfaces

## [1.50.1] - 2026-06-05

- enforce all-client AIOS turn compression compliance
- add `bidirectional-turn-compression` proof matrix covering `pre_send` and `post_receive` for every client/host
- mark uncontrolled direct host output as `policy-violation`/`non_compliant` instead of reporting fake savings
- train `aios-interception-runtime` with SkillOpt-Lite and publish the training artifact under `.skillopt/aios-interception-runtime-2026-06-05`

## [1.50.0] - 2026-06-04

- add v1.50.0 docs, blog tutorial, and site resources for unified AIOS search
- document all-client native search guidance inheritance across Codex, Claude, Gemini, Antigravity, OpenCode, and Crush
- publish usage guidance for memo visibility filters, source filters, and release verification

## [1.42.0] - 2026-06-04

- add unified AIOS project search

## [1.41.0] - 2026-06-04

- add multi-client capability gates and memo scope guidance

## [1.40.0] - 2026-05-31

### Added

- feat(clients): add Antigravity CLI support (replaces deprecated Gemini CLI)
- feat(clients): add Crush (charmbracelet) client support with `--yolo` unattended mode
- feat(clients): add team/model-router/harness instruction partials for opencode
- feat(clients): add opencode team capability support
- feat(opencode): add agent management and agent emitter for opencode
- feat(clients): expand superpowers capability to all 6 clients (codex, claude, gemini, antigravity, opencode, crush)
- feat(clients): expand skills/native/harness capabilities to all 6 clients

### Fixed

- fix(clients): add modelArgFlag for crush (`--model`)
- fix(clients): add crush to team capability
- fix(clients): add opencode to superpowers capability order
- fix(skills): remove XHS-only skills, expand core AIOS skills to all 6 clients
- fix(gemini): revert skill format from toml-command to markdown-directory
- fix(tests): repair codemap dedup assertion and release-pipeline missing crush agent emitter

### Changed

- refactor: complete AIOS adaptation layer phases 5-10
- chore: move experiments/ to .aios/experiments/ and gitignore

## [1.30.9] - 2026-05-28

- fix(windows): preserve AIOS PowerShell wrapper arguments

## [1.30.8] - 2026-05-28

- fix(windows): preserve AIOS PowerShell wrapper arguments

## [1.30.7] - 2026-05-28

- fix(codex): emit TOML agent roles and validate skill frontmatter

## [1.30.6] - 2026-05-28

- fix(tui): refresh installed skills state after setup/update/uninstall actions so picker reflects current disk state
- fix(skills): quote YAML frontmatter description fields containing Chinese punctuation to prevent parser errors

## [1.30.5] - 2026-05-27

- fix(superpowers): filter superpowers skills by catalog clients

## [1.30.4] - 2026-05-27

- fix(skills): consolidate compression skills, add skill-opt-lite, fix catalog duplicates

## [1.30.3] - 2026-05-26

- fix(team): auto-create plan artifact and set default ownedPathPrefixes to unblock team live preflight

## [1.30.2] - 2026-05-26

- fix(harness): make gate prompts recoverable

## [1.30.1] - 2026-05-25

- fix(mcp): handle Windows shell fallback and JSON-RPC notifications

## [1.30.0] - 2026-05-24

- refactor(aios): split large runtime modules, enforce generated/cache ignore rules, and preserve multi-client Windows command handling
- refactor(dispatch): improve CLI exit-code reset and route refs/canvas output through injected streams
- ci: install root script dependencies for release and performance smoke workflows

## [1.20.11] - 2026-05-23

- fix(windows): launch OpenCode native npm wrappers directly instead of via cmd.exe shell fallback

## [1.20.10] - 2026-05-23

- fix(install): avoid treating successful native stderr as fatal during PowerShell one-liner installs

## [1.20.9] - 2026-05-23

- fix(install): normalize Windows PowerShell shell-wrapper flags during release installs
- fix(install): normalize Windows privacy-guard wrapper flags during release installs
- test(install): add local Windows installer smoke coverage for the release PowerShell installer

## [1.20.8] - 2026-05-23

- fix(install): force TLS 1.2 for Windows release installer downloads and self-update bootstrap
- fix(install): fail fast when Windows installer dependency setup commands exit non-zero
- fix(tui): start the Ink TUI through the local tsx runtime and report non-interactive terminal limitations clearly

## [1.20.6] - 2026-05-22

- fix(memo): handle -h/--help gracefully in runMemo as fallback for Windows Commander edge cases
- fix(cli): relax node version check to >=24 (was strict ==24), improve nvm hints in all entry wrappers
- fix(ci): add root npm install to windows-shell-smoke workflow

## [1.20.5] - 2026-05-22

- feat(platform): add Windows MCP launcher (run-browser-use-mcp.ps1), cross-platform browser executable paths
- feat(platform): add resolveVenvPythonPath, resolveShellCommand, resolvePythonCommand helpers for cross-platform parity
- feat(platform): add Brave/Arc/Canary/Flatpak browser candidate paths across macOS/Windows/Linux
- fix(platform): replace hardcoded python3 with uv run + platform-aware resolution in aios-cred.mjs
- fix(platform): add HOME/USERPROFILE fallback in browser.mjs and self-update.mjs
- fix(platform): add uname guard for macOS Keychain security CLI in run-browser-use-mcp.sh
- fix(platform): use resolveVenvPythonPath in doctorBrowserMcp, resolveLauncherScript for platform-aware script paths
- test(platform): add platform-smoke.test.mjs (22 assertions covering MCP config, launchers, browser paths, py/uv)
- docs: add platform audit report (docs/plans/2026-05-22-platform-audit.md)

## [1.20.4] - 2026-05-22

- fix(install): fix Join-Path 3-arg syntax for PowerShell 5.1 compatibility in aios.ps1

## [1.20.3] - 2026-05-22

- fix(install): handle archives with or without harness-cli/ prefix (Windows + bash)
- fix(codemap): repair multi-client CRG install loop

## [1.20.2] - 2026-05-21

- fix(codemap): fix claude code MCP config path and codex createIfMissing logic

## [1.20.1] - 2026-05-21

- feat(codemap): integrate code-review-graph as first-class AIOS component with docs, blog, and i18n support

## [1.19.0] - 2026-05-19

- feat: add aios version and runtime update

## [1.18.7] - 2026-05-19

- docs: update repository URL to harness-cli

## [1.18.6] - 2026-05-19

- fix: rename release archives to harness-cli

## [1.18.5] - 2026-05-19

- docs: rename product brand to Harness CLI

## [1.18.4] - 2026-05-19

- ci: relax ContextDB benchmark gate for Node 24

## [1.18.3] - 2026-05-19

- fix: align mcp-server Node runtime pin

## [1.18.2] - 2026-05-19

- fix: run GitHub workflows on Node 24

## [1.18.1] - 2026-05-19

- fix: align Node 24 install guidance for node:sqlite

## [1.18.0] - 2026-05-17

- feat(offload): add canvas backfill and Claude hook

## [1.17.1] - 2026-05-17

- fix: pin AIOS root for shell and Stop hooks

## [1.17.0] - 2026-05-16

- feat(memo): add git-friendly storage backends

## [1.16.0] - 2026-05-16

- feat(contextdb): move runtime state into .aios
- fix(contextdb): keep workspace metadata and handoff compatibility under .aios runtime roots

## [1.15.1] - 2026-05-15

- fix: restore aios init release entrypoint

## [1.15.0] - 2026-05-14

- feat(contextdb): add project-local memo genealogy GUI
- feat(contextdb): add relationship-first GUI layout, bilingual labels, and tips glossary
- fix(contextdb): restore wheel and button zoom interactions in the memo GUI

## [1.14.1] - 2026-05-14

- fix model-router client launch flags

## [1.14.0] - 2026-05-14

- add ContextDB memory genealogy TUI

## [1.13.1] - 2026-05-13

- fix shell wrapper claude print prompt routing

## [1.13.0] - 2026-05-13

- feat(native): add route shortcuts

## [1.12.4] - 2026-05-13

- fix(shell): preserve PowerShell TTY for wrapped CLIs

## [1.12.3] - 2026-05-12

- docs: add token compression wireframe and X draft

## [1.12.2] - 2026-05-12

- docs: add token compression website and blog coverage

## [1.12.1] - 2026-05-12

- fix(installer): run first setup for release installs

## [1.12.0] - 2026-05-11

- feat(harness): persist stage checkpoint evidence

## [1.11.2] - 2026-05-11

- fix: run Codex subagents unattended

## [1.11.1] - 2026-05-11

- fix browser MCP installer path portability

## [1.11.0] - 2026-05-09

- feat(debug-hub): add instrumentation tracking and automatic cleanup (v0.3.0)
  - New MCP tools: `debug_hub.instrument`, `debug_hub.list_instruments`, `debug_hub.cleanup_instruments`
  - Marker convention `DH:<sessionId>` for zero-dependency debug log injection and cleanup
  - Dual-mode cleanup: explicit (instrument records) and discovery (workspace grep fallback)
  - Dry-run support for safe cleanup preview
- feat(debug-hub): add debug-hub skill replacing upstream debug skill
- feat(debug-hub): add cross-model debug instrumentation protocol via workspace memory

## [1.10.0] - 2026-05-09

- feat(debug-hub): add agent debugging sessions and trace materialization
- fix(debug-hub): debounce trace materialization, harden path safety, add input validation, and improve search correctness

## [1.9.0] - 2026-05-08

- Enable model-router per-phase team dispatch

## [1.8.1] - 2026-05-08

- fix localized docs links and site validation

- feat(perception): add content outcome recording, insight generation, and perception summary for agent learning loop
- feat(debug-hub): add MCP-native debug log service with Node.js/Browser/Go SDKs, embedded Web UI, and file-based storage

## [1.8.0] - 2026-05-08

- feat(model-router): add intelligent model dispatch for multi-model Agent Teams
  - Model capability registry (`memory/specs/model-registry.json`) with 8 models and structured strengths/costs/CLI protocols
  - Task-type to model routing: code-review→Opus, implementation→DeepSeek, research→Gemini, browser→GPT-5.5, and more
  - Three CLI protocol adapters: claude (--model), codex (-m), gemini (-m)
  - Cost-ascending fallback chains for all task types
  - Agent-callable `model-router` skill for self-service routing
  - `model-router list|route|stats` CLI commands
  - Orchestrator agent cards with `preferredModel` field (env var → preferredModel → model fallback)
  - `AIOS_MODEL_{ROLE}` environment variable overrides
  - Perception integration: model dispatch events recorded to ContextDB for historical success-rate learning
  - Injected into AIOS Task Router guide for automatic agent awareness
- feat: add self-trigger harness routing for wrapped agents

## [1.7.1] - 2026-04-26

- docs(blog): add solo harness release post
- docs(memo): clarify existing persona and user profile memory

## [1.7.0] - 2026-04-26

- feat(harness): add solo overnight harness and official docs

## [1.6.3] - 2026-04-25

- docs(site): sync visual onboarding across locales

## [1.6.2] - 2026-04-25

- docs(site): add visual onboarding for Chinese docs

## [1.6.1] - 2026-04-25

- fix(release): restore GitHub release pipeline and simplify Chinese onboarding docs

## [1.6.0] - 2026-04-25

- feat(aios): consolidate merged feature work
- feat(competitors): add watchlist roadmap and updater script
- feat(team): add watchdog recovery command and status integration
- feat(contextdb): add search explanations and hygiene dry-run tools
- fix(contextdb): ignore stale generated ContextDB CLI during context packet refresh

## [1.5.0] - 2026-04-25

- feat(orchestrate): add plan ownership preflight gates

## [1.4.0] - 2026-04-25

- feat(contextdb): add compact continuity summaries

## [1.3.1] - 2026-04-24

- fix(release): bootstrap direct installer dependencies

## [1.3.0] - 2026-04-24

- feat(harness): surface dispatch insights in team HUD

## [1.2.0] - 2026-04-24

- feat: add Privacy Shield for wrapped coding agent sessions

## [1.1.1] - 2026-04-23

- fix routed team/subagent startup in external workspaces

## [1.1.0] - 2026-04-02

- feat(tui): switch to React Ink + Ink UI component architecture for TUI installer
- feat(tui-ink): add MemoryRouter-based screen navigation (MainScreen, SetupScreen, UpdateScreen, UninstallScreen, DoctorScreen, SkillPickerScreen, ConfirmScreen)
- feat(tui-ink): add useSetupOptions hook for shared options state
- feat(tui-ink): add custom ScrollableSelect component for skill-picker scrolling window
- feat(tui-ink): add Header, Footer, Checkbox components
- refactor(tui): remove old string-rendering TUI implementation
- fix(tui-ink): add React imports and fix tsx execution
- docs: add Ink TUI refactoring design and implementation plan

## [1.0.0] - 2026-03-17

- feat(skills): adopt canonical skill source tree and standardize on node 22

- feat(aios): wire orchestrator agents into lifecycle components
- feat(orchestrate): derive blueprint phases from orchestrator-blueprints spec
- feat(harness): implement `subagent-runtime` live execution via CLI subagents (`AIOS_SUBAGENT_CLIENT=codex-cli|claude-code|gemini-cli`)
- feat(harness): prefer codex-cli v0.114+ structured exec outputs (`--output-schema`, `--output-last-message`, stdin) for stable JSON handoffs (falls back for older versions)
- feat(skills): add scope-aware catalog-driven installation flow for `global` and `project`
- feat(skills): expose project-oriented skills in both scope pickers without default selection
- feat(skills): include `skill-constraints`, `aios-project-system`, `aios-long-running-harness`, and `contextdb-autopilot` in the default core set
- feat(tui): show skill descriptions, group skills into `Core` / `Optional`, and show only installed skills during uninstall
- fix(skills): warn when project installs override global installs during doctor checks
- fix(learn-eval): route ContextDB quality failures to a concrete gate target
- fix(ctx-agent): fail-open when context:pack fails (set CTXDB_PACK_STRICT=1 to make it fatal)
- fix(ctx-agent): honor cmd-backed CLI wrappers by using shell-aware spawn specs (prevents Windows wrapper regressions)
- fix(contextdb): tolerate legacy context records (missing text/refs/actions) in context packs
- test(contextdb): add ContextDB quality gate to prevent context:pack regressions
- docs: document orchestrate live execution + subagent runtime env controls
- docs(blog): add a release note post for subagent runtime
- docs(blog): add a release note post for scope-aware skills install UX

## [0.17.0] - 2026-03-17

- feat(tui): add uninstall picker scrolling, bottom-anchored bulk actions, and installed markers in setup/update pickers
- fix(tui): keep uninstall picker cursor selection aligned with the rendered grouped order
- docs: update README and docs-site onboarding copy for the improved skills picker UX
- docs(blog): extend the skills install experience post with the latest TUI uninstall and installed-marker improvements

## [0.16.0] - 2026-03-10

- feat(aios): add orchestrator agent catalog and generators

## [0.15.0] - 2026-03-10

- feat(aios): gate live orchestrate execution behind AIOS_EXECUTE_LIVE

## [0.14.0] - 2026-03-10

- feat(aios): add subagent runtime stub adapter

## [0.13.0] - 2026-03-10

- feat(aios): externalize runtime manifest spec

## [0.12.0] - 2026-03-10

- feat(aios): add runtime adapter boundary

## [0.11.0] - 2026-03-10

- feat(aios): expand local orchestrate preflight coverage

## [0.10.4] - 2026-03-08

- fix wrapper fallback for non-git workspaces and sync docs

## [0.10.3] - 2026-03-08

- fix(windows): support cmd-backed cli launch

## [0.10.2] - 2026-03-08

- fix(windows): route contextdb npm calls through node cli

## [0.10.1] - 2026-03-08

- fix(windows): resolve npm cli launch in node lifecycle

## [0.10.0] - 2026-03-08

- feat(onboarding): consolidate lifecycle flow into node

## [0.9.0] - 2026-03-07

- feat: add hybrid browser snapshot and visible-first launch defaults

## [0.8.1] - 2026-03-05

- docs: add contextdb Node ABI mismatch troubleshooting

## [0.8.0] - 2026-03-05

- add strict privacy guard with ollama-backed redaction

## [0.7.0] - 2026-03-05

- feat: add browser challenge detection and handoff signals

## [0.6.2] - 2026-03-04

- fix: auto-create .contextdb-enable for opt-in wrapper mode

## [0.6.1] - 2026-03-04

- fix(windows): harden browser doctor and clarify Node 20+ prerequisites

## [0.6.0] - 2026-03-04

- feat: add cross-CLI doctor + security scan skill pack

## [0.5.3] - 2026-03-04

- docs(site): wire docs/blog nav both ways and simplify blog home footer sections

## [0.5.2] - 2026-03-03

- docs(site): move rexai links to global footer navigation

## [0.5.1] - 2026-03-03

- docs: align superpowers workflow route and add RexAI friend links

## [0.5.0] - 2026-03-03

- feat(contextdb): add SQLite sidecar index (`memory/context-db/index/context.db`) with `index:rebuild`
- feat(contextdb): switch `search`/`timeline`/`event:get` to SQLite-backed retrieval with rebuild fallback
- feat(contextdb): add optional semantic rerank path (`--semantic`, `CONTEXTDB_SEMANTIC=1`)
- refactor(scripts): unify `ctx-agent.sh` and `ctx-agent.mjs` through `ctx-agent-core.mjs`

## [0.4.3] - 2026-03-03

- docs: improve functional page SEO/GEO with AI-search answers and changelog nav

## [0.4.2] - 2026-03-03

- docs: merge windows guide into quick start with os tabs

## [0.4.1] - 2026-03-03

- docs: add dedicated windows guide pages and quick-start cross-links

## [0.4.0] - 2026-03-03

- feat: add Windows PowerShell support for browser/contextdb setup

## [0.3.1] - 2026-03-03

- chore: bump version after browser mcp onboarding rollout

## [0.3.0] - 2026-03-03

- feat: add one-command browser mcp install/doctor and default cdp fallback

## [0.2.0] - 2026-03-03

- feat: add semver governance and versioning-by-impact skill

## [0.1.0] - 2026-03-03

- Initialize project versioning (`VERSION`, `CHANGELOG.md`) and release tooling baseline.

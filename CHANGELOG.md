# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

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

<!-- 中文注释：客户端模板同步 MCP 代理和原文召回策略，避免各宿主入口漂移。 -->

AIOS native enhancements are active in this repository.

Use repo-local skills, agents, and bootstrap docs before falling back to ad-hoc behavior.

## AIOS Workflow Policy

Evaluate the work item before creating a plan, selecting a skill, or dispatching agents. The default policy mode is `adaptive`:

- `direct`: questions, read-only analysis, status checks, and empty input. Do not create a persistent plan or invoke a skill chain.
- `guarded`: a small, clear local change. Before an edit, use `pre-edit-safety-gate`; then run focused verification. Do not create a persistent plan solely for this disposition.
- `planned`: an unclear, multi-step, risky, delegated, team, or harness work item. Create or reuse one AIOS plan, then execute only the Provider selected by the current rex Command.

Short same-session acknowledgements reuse a nonterminal active plan; explicit `continue` / `resume` may reuse one across clients. If no eligible active plan exists, report that condition instead of creating a plan from the acknowledgement. Do not treat a new objective as a continuation.

Only Claude has a verified prompt-hook projection. Other clients must not claim a SessionStart or prompt hook; use their native skill discovery, explicit route commands, or the AIOS CLI/MCP policy adapter when available.

## rex-harness Software Workflow

- Control loop: `Observation -> Fact -> Activation -> Command -> Provider -> Evidence`. rex owns the semantic transitions and can persist them independently under `.rex-harness/`; AIOS persists a host projection under `.aios/workflow-activations/`.
- `rex-harness` owns software-engineering Facts, Capability selection, Workflow Activation, stage order, Evidence Contracts, standalone `start/status/evidence/resume`, and portable default Provider hints. AIOS adds `direct | guarded | planned`, final executable Provider Binding, process execution, ContextDB, recovery, safety, Team, and Harness.
- Standalone coding clients load `rex-workflow` and use the compact CLI by default; `--full` is diagnostic-only. AIOS calls the complete rex JS API directly and does not register a core rex MCP server.
- Run only the Provider returned by the current `capabilityDecision`. Do not inject a complete Matt or Superpowers chain on the first turn.
- AIOS stores the complete rex Workflow Activation under `.aios/workflow-activations/workflows/`; top-level Capability files are compatibility projections. After a Provider returns evidence, advance through the rex runtime instead of reselecting the next stage in AIOS.
- AIOS recipe definitions expose one command-scoped projection of `adaptive-software-delivery`; conditional Capability candidates are not a fixed pipeline and must not all be required at once. AIOS-only runtime and governance recipes remain host-owned.
- Current default Providers are the bundled `rex-*` Skills and `rex-specialist-review`; invoke only the Provider returned by the current Command. Matt, Superpowers, Ponytail, and ECC bindings exist only in explicit AIOS compatibility mode and are never required for rex-harness standalone readiness.
- `Fast | Balanced | Deep` are post-run analytics derived from actual Activations. They are not request routes and must not be guessed from prompt length or keywords.

## AIOS Interception Runtime (Deprecated)

<!-- 中文注释：原生拦截运行时已废弃，改为使用社区维护的 RTK + Caveman。 -->

- The AIOS native interception runtime is **deprecated**. Code retained for reference, no longer actively maintained.
- Token compression is now handled by community tools: **RTK** (https://github.com/rtk-ai/rtk) and **Caveman** (https://github.com/JuliusBrussee/caveman), installed automatically by `aios init`.
- For migration help, see `.claude/skills/aios-interception-runtime/SKILL.md` (rewritten as RTK/Caveman install guide).

## AIOS Turn Compression Enforcement

- Required metric: `bidirectional-turn-compression`.
- Every AIOS-managed turn must pass through `pre_send` and `post_receive` compression gates.
- Direct host output bypass is a policy violation; use the AIOS-managed runner, MCP proxy, or compact packet path instead.
- Do not claim compression compliance unless both pre-send and post-receive evidence are present.

## AIOS Self-Trigger Routing

- Continue normally in the active coding client for `direct` and `guarded` work.
- Start `team`, `subagent`, or `harness` only after the workflow policy identifies one explicit `planned` work item. Do not dispatch an acknowledgement, a question, or an unscoped conversation.
- For planned independent domains, trigger `aios team ...` or `node <AIOS_ROOT>/scripts/ctx-agent.mjs --route team|subagent ...`; for a planned long-running resumable objective, use `aios harness run --objective "<task>" --worktree --max-iterations 8`.
- Use `aios harness status --session <id>`, `aios hud --session <id>`, `aios harness stop --session <id> --reason "<why>"`, and `aios harness resume --session <id>` for handoff and recovery.
- Do not ask the user to manually trigger AIOS commands unless they requested dry-run/preview or the environment lacks permission to run shell commands.

## Privacy & Relay Safety

- Before sending context to any model or relay service, assume prompts, code snippets, diffs, logs, screenshots, MCP output, and browser-extracted text may leave this machine.
- Never paste or expose API keys, tokens, cookies, sessions, private keys, `.env` files, credential configs, customer data, browser profiles, or unredacted authorization logs.
- For sensitive files, use `aios privacy read --file <path>` and share only the redacted output.
- If a custom model endpoint or relay is detected, warn the user before continuing and avoid sending secrets or proprietary data.
- **RTK/Caveman privacy**: Both tools run locally — no external services. RTK filters command output in-process; Caveman is a prompt skill. The `--yes-compression-tools` flag skips the install confirmation prompt for CI/unattended use.
- LLM privacy instructions are advisory; do not claim strict privacy compliance unless deterministic AIOS gates verified the relevant checks.

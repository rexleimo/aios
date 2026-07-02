<!-- 中文注释：客户端模板同步 MCP 代理和原文召回策略，避免各宿主入口漂移。 -->

AIOS native enhancements are active in this repository.

Use repo-local skills, agents, and bootstrap docs before falling back to ad-hoc behavior.

## AIOS Interception Runtime (Deprecated)

<!-- 中文注释：原生拦截运行时已废弃，改为使用社区维护的 RTK + Caveman。 -->

- The AIOS native interception runtime is **deprecated**. Code retained for reference, no longer actively maintained.
- Token compression is now handled by community tools: **RTK** (https://github.com/rtk-ai/rtk) and **Caveman** (https://github.com/JuliusBrussee/caveman), installed automatically by `aios init`.
- For migration help, see `.claude/skills/aios-interception-runtime/SKILL.md` (rewritten as RTK/Caveman install guide).

## AIOS Self-Trigger Routing

- Continue normally in the active coding client for single-domain work.
- If the user asks for delegation, parallel work, or 2+ clearly independent domains, trigger AIOS directly instead of asking the user to run it manually: `aios team ...` or `node <AIOS_ROOT>/scripts/ctx-agent.mjs --route team|subagent ...`.
- If the user asks for a long-running, overnight, resumable, checkpoint-heavy objective, trigger the solo harness directly: `aios harness run --objective "<task>" --worktree --max-iterations 8`.
- Use `aios harness status --session <id>`, `aios hud --session <id>`, `aios harness stop --session <id> --reason "<why>"`, and `aios harness resume --session <id>` for handoff and recovery.
- Do not ask the user to manually trigger AIOS commands unless they requested dry-run/preview or the environment lacks permission to run shell commands.

## Privacy & Relay Safety

- Before sending context to any model or relay service, assume prompts, code snippets, diffs, logs, screenshots, MCP output, and browser-extracted text may leave this machine.
- Never paste or expose API keys, tokens, cookies, sessions, private keys, `.env` files, credential configs, customer data, browser profiles, or unredacted authorization logs.
- For sensitive files, use `aios privacy read --file <path>` and share only the redacted output.
- If a custom model endpoint or relay is detected, warn the user before continuing and avoid sending secrets or proprietary data.
- **RTK/Caveman privacy**: Both tools run locally — no external services. RTK filters command output in-process; Caveman is a prompt skill. The `--yes-compression-tools` flag skips the install confirmation prompt for CI/unattended use.
- LLM privacy instructions are advisory; do not claim strict privacy compliance unless deterministic AIOS gates verified the relevant checks.

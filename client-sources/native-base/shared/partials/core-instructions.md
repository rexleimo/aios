<!-- 中文注释：客户端模板同步 MCP 代理和原文召回策略，避免各宿主入口漂移。 -->

AIOS native enhancements are active in this repository.

Use repo-local skills, agents, and bootstrap docs before falling back to ad-hoc behavior.

## AIOS Interception Runtime

- Large tool/browser/shell outputs must go through the AIOS interception data plane when an AIOS-controlled surface exists.
- For proof, run `node scripts/aios.mjs interception proof --json`; for repair, run `node scripts/aios.mjs interception doctor --fix`.
- MCP browser tools must be routed as `client -> scripts/aios-mcp-proxy.mjs -> real MCP server`, producing compact packets, raw refs, and metrics.
- Host-native shell hooks, where supported, should route safe noisy Bash commands through `scripts/hooks/claude/aios-rewrite.sh` -> `scripts/aios-intercept.mjs`; inspect with `node scripts/aios.mjs interception rewrite --command "<cmd>"`.
- Do not claim RTK/Caveman parity without metrics from `.aios/interception/metrics/<session>.jsonl`.

## AIOS Turn Compression Enforcement

- Every AIOS-owned agent turn must satisfy the shared `bidirectional-turn-compression` metric: compress before sending to the target client (`pre_send`) and compress after receiving the client output (`post_receive`).
- Launch live agent work through the AIOS-managed runner (`ctx-agent`, `aios team`, `aios harness`, or an AIOS subagent runtime); direct host execution that bypasses this runner is a policy violation.
- Native CLI entrypoints should be launched through managed `~/.aios/bin/<client>` shims when shell setup is installed; verify with `node scripts/aios.mjs clients doctor --native-strict --json`.
- If direct host output or raw uncompressed tool output is observed, stop the live run, record it as `uncontrolled_host_output`, and restart through the AIOS-managed runner instead of accepting the result.
- Do not report token savings for uncontrolled output; compliant savings require compact packets, raw refs, and metrics records for both `pre_send` and `post_receive`.


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
- LLM privacy instructions are advisory; do not claim strict privacy compliance unless deterministic AIOS gates verified the relevant checks.

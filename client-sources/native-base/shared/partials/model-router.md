<!-- Model router 指令 — 仅对具备 team capability 的客户端下发 -->

## AIOS Model Router

AIOS supports per-role model routing in team and subagent workflows. The following environment variables control model selection:

- `AIOS_MODEL_ROUTER` — Set to `1` to enable model routing (default: `0`).
- `AIOS_MODEL_PLANNER` — Model ID for the planner phase (e.g., `gemini-3-pro`).
- `AIOS_MODEL_IMPLEMENTER` — Model ID for the implementer phase (e.g., `gpt-5.5`).
- `AIOS_MODEL_REVIEWER` — Model ID for the reviewer phase (e.g., `claude-opus`).
- `AIOS_MODEL_SECURITY_REVIEWER` — Model ID for the security reviewer phase.

When model routing is active:
1. Read `AIOS_MODEL_ROUTER` at startup to determine if routing is enabled.
2. Use the client's model flag (`-m`, `--model`) to set the assigned model.
3. Record the model used in any dispatch evidence or event logs.
4. If a model env var is unset, fall back to the client's default model.

This enables heterogeneous team workflows where different roles use different LLM providers (e.g., Gemini for planning, Codex for implementation, Claude for review).

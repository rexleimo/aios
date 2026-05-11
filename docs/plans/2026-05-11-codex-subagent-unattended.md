# Codex Subagent Unattended Execution Fix

## Objective

Prevent `agent team` / Model Router live runs from leaving Codex child workers waiting on approval or sandbox prompts.

## Evidence

- `codex exec --help` exposes `--dangerously-bypass-approvals-and-sandbox`.
- Existing runtime built Codex child argv as `codex exec ... -m <model> ... -` without any yolo/bypass equivalent.
- The existing model registry advertised a stale `codex --yolo -m <model> -p "<prompt>"` protocol, while the live runtime actually uses `codex exec` with stdin and structured-output flags.

## Plan

1. Add a regression test that captures Codex child argv and requires an unattended bypass flag.
2. Preserve the bypass flag through structured-output fallback paths.
3. Keep Model Router metadata aligned with the actual `codex exec` protocol.
4. Sync generated skills and documentation so operators see the correct command shape and opt-out env var.

## Acceptance

- Codex child workers include `--dangerously-bypass-approvals-and-sandbox` by default.
- Model-routed Codex jobs show the same unattended command in `## Model Router` prompt metadata.
- Fallback retries still include the bypass flag.
- Operators can disable the bypass for manual debugging with `AIOS_SUBAGENT_CODEX_UNATTENDED=0`.

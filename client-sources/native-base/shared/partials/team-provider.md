<!-- Team provider 指令 — 仅对具备 team capability 的客户端下发 -->

## AIOS Team Provider

When this client is launched by AIOS as a team worker (`ctx-agent.mjs --route team`), it runs in unattended mode. Key behaviors:

- **Unattended execution**: The client is launched with auto-approve flags (e.g., `--yolo`, `--dangerously-skip-permissions`). Do not prompt for permissions — assume all operations are pre-authorized by the AIOS orchestrator.
- **Model routing**: The `--team-provider` flag and `AIOS_MODEL_ROUTER` env var determine which model each phase uses. Check `AIOS_MODEL_*` env vars for per-role model assignments.
- **Output format**: Results are captured by the AIOS ctx-agent runtime. Produce structured, parseable output — avoid interactive-only output (TUI elements, spinners, progress bars).
- **Error handling**: If a task fails, write a clear error summary to stderr and exit with non-zero code. The orchestrator will handle retries.
- **Scope isolation**: Each team worker owns a specific domain. Do not modify files outside your assigned scope unless explicitly told to.
- **Handoff**: When finished, summarize what was done, what was changed, and any blockers in a concise handoff note.

<!-- Harness 指令 — 所有客户端都下发 -->

## AIOS Solo Harness

When this client is launched by AIOS solo harness (`aios harness run`):

- **Objective-driven**: The harness provides a multi-line objective and runs iterative loops. Each iteration should advance toward the objective.
- **Checkpoints**: After each significant change, record progress via `aios memo add`. The harness reads these for recovery.
- **Session state**: All state is persisted in `.aios/context-db/` and `.aios/workspace/`. On resume, read these first to continue where you left off.
- **Iteration budget**: The harness sets `AIOS_HARNESS_MAX_ITERATIONS` (default 8). Respect this limit and wrap up cleanly when approaching it.
- **Worktree isolation**: If `--worktree` is active, changes happen in a git worktree. Commit frequently with clear messages for merge readiness.
- **Evidence**: Before claiming a sub-task is done, produce concrete evidence (test output, file diffs, screenshots). The harness validates evidence before advancing.
- **Failure recovery**: On failure, do not silently retry. Write the error to `aios memo add` with the failure context, then exit. The harness will retry with fresh context.

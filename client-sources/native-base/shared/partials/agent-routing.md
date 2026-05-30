<!-- 中文注释：subagent 分派细则段，仅对具备 agents 能力的客户端下发（codex/claude 安装了 repo-local agents）。 -->

## AIOS Subagent Dispatch

- This client ships repo-local agent definitions; prefer them over ad-hoc roles.
- Independent domains can run as parallel subagents; keep coupled or shared-state changes sequential.
- Use `superpowers:dispatching-parallel-agents` to fan out, then converge with a verification pass before merge.
- If no true subagent tool is available, emulate parallelism with explicit domain queues and only safe parallel reads/checks.

<!-- 中文注释：subagent 分派细则段，仅对具备 agents 能力的客户端下发（codex/claude 安装了 repo-local agents）。 -->

## AIOS Subagent Dispatch

- This client ships repo-local agent definitions; prefer them over ad-hoc roles.
- Dispatch only one explicit `planned` work item at a time. Independent domains can run as parallel subagents; keep coupled or shared-state changes sequential.
- Use `superpowers:dispatching-parallel-agents` only when the policy selects team work, then converge with a verification pass before merge. Do not re-run the global bootstrap or create a new plan in each worker.
- If no true subagent tool is available, emulate parallelism with explicit domain queues and only safe parallel reads/checks.
- When agent roles are added or promoted, run the core-risk smoke plan first and require accepted SkillOpt training evidence before live workflow participation.

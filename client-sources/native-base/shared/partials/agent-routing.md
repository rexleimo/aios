<!-- 中文注释：subagent 分派细则段，仅对具备 agents 能力的客户端下发（codex/claude 安装了 repo-local agents）。 -->

## AIOS Subagent Dispatch

- This client ships repo-local agent definitions; prefer them over ad-hoc roles.
- Dispatch only one explicit `planned` work item at a time. Independent domains can run as parallel subagents; keep coupled or shared-state changes sequential.
- Every dispatched worker runs only the Provider selected by the current Rex Capability Command.
- Dispatch parallel workers only when the policy selects team work, then converge with a verification pass before merge. Do not create a replacement plan in each worker.
- Do not dispatch ECC-inspired roles merely because a request looks complex. Dispatch a specialist only after rex selects `software.review.specialist` and AIOS capability plus smoke gates permit the role.
- If no true subagent tool is available, emulate parallelism with explicit domain queues and only safe parallel reads/checks.
- When agent roles are added or promoted, run the core-risk smoke plan first and require accepted SkillOpt training evidence before live workflow participation.

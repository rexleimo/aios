<!-- 中文注释：subagent 分派细则文本。⚠ 它不是投递机制（2026-10-30 行为级实测：跑真实投影 + 记录 loader 实际读了哪些文件）：
shared/partials 下 10 个 partial 只有 `core/core-instructions.md` 会被 composeNativeMarkdown 读入，
本文件以及 contextdb/codemap/harness/browser-mcp/client-capabilities/team-provider/model-router/token-discipline
共 9 个从未进入任何模型可见面（`readSharedMarkdownParts` 零调用者）。仓库代码与已安装运行时结论一致。

真正送达模型的两处（A 方案只认这两处）：
1) worker 侧：emitters/shared.mjs 的 SUBAGENT_CONTEXT_CONTRACT_LINES，
   实测 .codex/agents + .claude/agents 共 38/38 张卡命中；
2) 派发载荷侧：foundation/agents/brief/render.mjs 的 `## Dispatch Brief`（任务依据 +
   “先查授权来源，仍缺事实才 blocked”），由 subagent-runtime/context/prompts.mjs 注入真实 worker prompt。

送达事实由 scripts/tests/foundation/native/native-partial-delivery.test.mjs 钉住（双向突变已验证会红）；
本文件的文字必须与那两个 live 面一致，同一测试里逐条校。改这里不会改变任何客户端的行为。
-->

## AIOS Subagent Dispatch

- This client ships repo-local agent definitions; prefer them over ad-hoc roles.
- Start every subagent with a fresh context window; never let it inherit this conversation.
- When a host cannot honor that, use the brief to define the task without treating it as context isolation. The per-client measurement lives in `config/host-capabilities.json` under `subagents.contextMode` (read it with `aios status`; do not restate verdicts here): where it says `fork`, keep from the parent conversation anything the child must not see, because a default spawn will carry it over.
- Give a subagent a self-contained brief (objective, write ownership, acceptance, refs), delivered task context and upstream handoffs. Allow workspace inspection and available tools within existing access permissions. Only after checking authorized sources, if a required fact remains unavailable, it returns `blocked` naming the missing item and checks attempted instead of inventing facts or asking for the transcript. Ownership limits edits, not related dependency reads.
- Dispatch only one explicit `planned` work item at a time. Independent domains can run as parallel subagents; keep coupled or shared-state changes sequential.
- Every dispatched worker runs only the Provider selected by the current Rex Capability Command.
- Dispatch parallel workers only when the policy selects team work, then converge with a verification pass before merge. Do not create a replacement plan in each worker.
- Do not dispatch ECC-inspired roles merely because a request looks complex. Dispatch a specialist only after rex selects `software.review.specialist` and AIOS capability plus smoke gates permit the role.
- If no true subagent tool is available, emulate parallelism with explicit domain queues and only safe parallel reads/checks.
- When agent roles are added or promoted, run the core-risk smoke plan first and require accepted SkillOpt training evidence before live workflow participation.

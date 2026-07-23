# GAIA A/B Hermes Adapter Security Review

## Specialist Scope

Reviewer: `security`. Scope is limited to the pure Hermes invocation object,
its model pin, usage path, and expected-answer boundary.

## Evidence

- Hermes accepts only `deepseek-v4-pro` and a non-empty local usage path.
- The task envelope is reused from the Codex/Claude path and does not access
  `task.expected`; the sentinel test passes in
  `receipt:81b9eedd-25e7-4012-be10-96b4f5bc888f`.
- The invocation has no safe-mode or ignore-rules bypass option.

## Verdict

No current security defect: this module never starts a process. Deferred P2
risk: Hermes one-shot mode takes its prompt as an argv value, which can expose
the task prompt to local process inspection once launch behavior exists.

Required action before live enablement: the process-launch work item must
either use a Hermes-supported non-argv input path or explicitly document and
obtain approval for the bounded local process-visibility risk. It must never
allow secrets or private task content in that invocation.

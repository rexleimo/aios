## AIOS Native Claude Layer

- Prefer repo-local `.claude/skills` and `.claude/agents`.
- SessionStart is read-only status output; it must not create a plan or inject a workflow chain.
- UserPromptSubmit calls the workflow-policy adapter. It decides `direct`, `guarded`, or `planned` before a plan or skill is selected.
- Keep work grounded in the AIOS runtime and verification flow after that decision.

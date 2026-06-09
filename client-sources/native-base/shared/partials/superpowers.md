<!-- 中文注释：superpowers 流程强制段，仅对具备 superpowers 能力的客户端下发，避免向无此技能的宿主发指令。 -->

## AIOS Superpowers Workflow

- Before any implementation action, route through the superpowers process skills instead of improvising. Invoke the skill — do not paraphrase or inline its process.
  - Design / new behavior / new feature → `superpowers:brainstorming`
  - Multi-step delivery → `superpowers:writing-plans`
  - Debugging / failure analysis → `superpowers:systematic-debugging`
  - Test-first implementation → `superpowers:test-driven-development`
  - About to claim completion → `superpowers:verification-before-completion`
- **Before any code modification** (any edit/create/delete), invoke `pre-edit-safety-gate` — checks CRG impact radius, dependencies, test coverage, and style alignment. CRG graph update + detect_changes + typecheck + test enforced after every edit. This gate applies across ALL task types.
- Use `aios-workflow-router` only as a routing aid; it does not replace the superpowers skills.
- Close a task only after `superpowers:verification-before-completion` passes with concrete artifact evidence.

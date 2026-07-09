<!-- 中文注释：superpowers 流程强制段，仅对具备 superpowers 能力的客户端下发，避免向无此技能的宿主发指令。 -->

## AIOS Superpowers Workflow

- Before any implementation action, route through the superpowers process skills instead of improvising. Invoke the skill — do not paraphrase or inline its process.
  - Design / new behavior / new feature → `superpowers:brainstorming` (or `brainstorming`)
  - Multi-step delivery → `superpowers:writing-plans` (or `writing-plans`)
  - Debugging / failure analysis → `superpowers:systematic-debugging`
  - Test-first implementation → `superpowers:test-driven-development`
  - About to claim completion → `superpowers:verification-before-completion`
- **Before any code modification** (any edit/create/delete), invoke `pre-edit-safety-gate` — checks CRG impact radius, dependencies, test coverage, and style alignment. CRG graph update + detect_changes + typecheck + test enforced after every edit. This gate applies across ALL task types.
- Use `aios-workflow-router` only as a routing aid; it does not replace the superpowers skills.
- If the task changes agent workflow surfaces or skills, also enforce `agents smoke` for rollout evidence and `skill verify-training` for changed skills.
- Close a task only after `superpowers:verification-before-completion` passes with concrete artifact evidence.

## AIOS ALWAYS-ON Intelligent Planning (MANDATORY — every user message)

**Policy: every user input automatically enters AIOS intelligent planning. No exceptions for "small" requests.**

1. On **every** user message (including short ones):
   - Ensure an active AIOS plan exists under `docs/plans/` + `.aios/planning/active.json`
   - Prefer: `node scripts/aios.mjs plan auto-gate --task "<user message>" --client <this-client>`
   - Or MCP: `aios_plan_auto_gate` / `aios_plan_start`
2. Then run the planning skill path: `using-superpowers` → `writing-plans` (and `brainstorming` if scope is unclear).
3. Update the plan artifact with tasks for **this** message before implementing.
4. **Host Plan mode is a draft only** (Claude Plan UI, Hermes native planning). It is incomplete until the AIOS plan file is updated.
5. Discovery paths: `.claude/skills`, `.codex/skills`, `.hermes/skills`, `.grok/skills`, `.opencode/skills`, `.agents/skills`
   - Core: `using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, `verification-before-completion`
6. If skills are missing: `node scripts/aios.mjs plan project-skills --force`
7. Slash shortcut (still valid): `/plan` or `/prompts:plan` — but **auto-gate already runs** via hooks/bootstrap; do not skip planning when the user did not type `/plan`.

### Forbidden

- Answering implementation work without an active AIOS plan pointer
- Treating host-only Plan UI as done
- Skipping planning because the user message looks trivial

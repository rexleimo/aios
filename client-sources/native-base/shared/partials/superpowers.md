<!-- 中文注释：Superpowers 是按需工程 playbook，不是每轮启动注入。 -->

## AIOS Superpowers Playbooks

- Do not invoke `using-superpowers` as a global bootstrap. The AIOS workflow policy chooses the smallest applicable playbook after it classifies the work item.
- For a `planned` work item, invoke the selected skill rather than paraphrasing its process:
  - unclear design or a new capability → `superpowers:brainstorming` (or `brainstorming`)
  - explicit multi-step plan → `superpowers:writing-plans` (or `writing-plans`)
  - observed failure or regression → `superpowers:systematic-debugging`
  - behavior change or bug fix → `superpowers:test-driven-development`
  - before delivery, completion, commit, or release → `superpowers:verification-before-completion`
- `direct` work does not need a Superpowers chain. `guarded` work uses the edit and verification gates below; it only adds a process skill when the policy selects one.
- **Before any code modification** (any edit/create/delete), invoke `pre-edit-safety-gate` — checks CRG impact radius, dependencies, test coverage, and style alignment. CRG graph update + detect_changes + typecheck + test enforced after every edit. This gate applies across ALL task types.
- Use `aios-workflow-router` only as a routing aid; it does not replace the superpowers skills.
- If the task changes agent workflow surfaces or skills, also enforce `agents smoke` for rollout evidence and `skill verify-training` for changed skills.
- Close a changed behavior only after the selected verification process has concrete artifact evidence. A host Plan UI is a draft aid; when the disposition is `planned`, persist the approved work item in the AIOS plan artifact.

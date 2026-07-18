<!-- 中文注释：Superpowers 是按需工程 playbook，不是每轮启动注入。 -->

## AIOS Superpowers Playbooks

- Do not invoke `using-superpowers` as a global bootstrap. The current rex Command, not a second prompt classifier, selects a Superpowers playbook.
- Software workflow ownership and default Provider implementation belong to `rex-harness`. AIOS invokes only the current Provider from the rex Capability Command and never preloads a fixed stack.
- AIOS defaults to bundled rex-native Providers. Matt, Superpowers, Ponytail, and ECC are optional compatibility replacements selected only when the caller explicitly enables compatibility mode; they do not participate in default readiness or routing.
- A Provider completing successfully is not enough to advance. Return the required evidence kinds to the AIOS Activation Ledger and let rex evaluate the transition.
- Invoke `brainstorming`, `writing-plans`, `test-driven-development`, or `systematic-debugging` only when that playbook is the Provider in the current rex Command; then follow the selected process instead of paraphrasing it.
- Do not translate user wording such as "new capability", "multi-step", "bug fix", or "failure" directly into a Superpowers playbook. Those observations must pass through rex Fact and Capability selection first.
- `verification-before-completion` remains an AIOS host completion gate before delivery, commit, or release; it does not choose or advance a rex Capability.
- `direct` work does not need a Superpowers chain. `guarded` and `planned` work invoke only the currently selected Provider.
- **Before any code modification** (any edit/create/delete), invoke `pre-edit-safety-gate` — checks CRG impact radius, dependencies, test coverage, and style alignment. CRG graph update + detect_changes + typecheck + test enforced after every edit. This gate applies across ALL task types.
- Use `aios-workflow-router` only as a routing aid; it does not replace the superpowers skills.
- If the task changes agent workflow surfaces or skills, also enforce `agents smoke` for rollout evidence and `skill verify-training` for changed skills.
- Close a changed behavior only after the selected verification process has concrete artifact evidence. A host Plan UI is a draft aid; when the disposition is `planned`, persist the approved work item in the AIOS plan artifact.

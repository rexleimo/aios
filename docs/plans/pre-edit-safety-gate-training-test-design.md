# Pre-Edit Safety Gate Training Test Design

## Scope Contract

- User goal: train `pre-edit-safety-gate` to select a proportionate local
  change, reuse, extension, or necessary refactor from evidence about the
  requested behavior and existing structure.
- In scope: decision quality for reuse, abstraction, encapsulation, decoupling,
  directory ownership, and focused verification.
- Out of scope: changing production behavior, refactoring application source,
  or treating the training cases as prescriptive implementation recipes.
- Completion: the repository certification records reproducible training
  evidence and the resulting source skill passes native consistency checks.

## Acceptance Mapping

| Case | Observable assertion | Public test seam |
| --- | --- | --- |
| Existing owner fits | Select a local change, not a new abstraction | `skill comply --live` scenario outcome |
| Similar semantic module | Reuse or extend its narrow contract | `skill comply --live` scenario outcome |
| Related duplicated features | Identify the domain boundary and authorize a refactor | `skill comply --live` scenario outcome |
| One-off local need | Reject speculative framework extraction | `skill comply --live` scenario outcome |
| Clear domain ownership | Place files and tests in the owning domain or layer | `skill comply --live` scenario outcome |
| Candidate skill | Accept only a strictly improved certification result | `skill certify --changed` evidence |
| Installed projections | All declared clients have no native drift | `doctor --native` exit status |

## Test Seams

The training has no application runtime seam. Its stable public seams are:

```text
node scripts/aios.mjs skill comply skill-sources/pre-edit-safety-gate/SKILL.md --live --client codex --json
node scripts/aios.mjs skill certify --changed --json
node scripts/aios.mjs skill verify-training --changed --json
node scripts/aios.mjs doctor --native
```

The evaluation must score a case as failed if the selected change shape ignores
semantic mismatch, preserves duplication that blocks the request, creates a
speculative abstraction, or puts the implementation in an ownerless directory.

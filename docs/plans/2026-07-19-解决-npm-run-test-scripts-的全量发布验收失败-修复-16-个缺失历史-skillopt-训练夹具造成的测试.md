# 解决 npm run test:scripts 的全量发布验收失败：修复 16 个缺失历史 .skillopt 训练夹具造成的测试失败，以及...

> AIOS Planning Contract (schema v2)
> created: 2026-07-19T14:38:55.338Z
> client: cli
> source: aios plan auto-gate
> route: debug

## Objective

解决 npm run test:scripts 的全量发布验收失败：修复 16 个缺失历史 .skillopt 训练夹具造成的测试失败，以及 1 个 rex-security-reviewer promotion 测试的 fail-closed 期望漂移；不得伪造真实 live smoke、metrics、provenance 或 SkillOpt 训练证据。补齐可复核的测试与发布验收。

## Route skills

1. `rex-debug`

## Tasks

- [ ] **t1-understand**: Clarify objective: 解决 npm run test:scripts 的全量发布验收失败：修复 16 个缺失历史 .skillopt 训练夹具造成的测试失败，以及 1 — _Objective restated; constraints listed_
- [ ] **t2-repro**: Reproduce and isolate failure — _Failing command/log captured as evidence_
- [ ] **t3-fix**: Implement fix — _Root cause addressed in code_
- [ ] **t4-verify**: Verify fix — _Previously failing check now passes (evidence attached)_

## Progress

- status: active

## Decision Log

- 2026-07-19: Reproduced `test:rex-integration` failure in
  `receipt:0e48a292-59b2-45f6-98a2-8a1d42833e5c`. The tests were not
  hermetic: one promotion fixture used superseded v1 evidence, while two
  training-evidence suites read absent, ignored historical `.skillopt`
  directories and treated missing evidence as accepted.
- 2026-07-19: Test scope is limited to release-test determinism. It does not
  create project live smoke, metrics, provenance, or accepted SkillOpt
  evidence. Runtime release gates remain fail-closed when those artifacts are
  absent or stale.
- 2026-07-19: Acceptance mapping: (1) an isolated v2-shaped agent-evidence
  fixture enables only its temporary test root; (2) a missing isolated
  SkillOpt state is blocked; (3) a temporary matching-hash state verifies only
  gate parsing and becomes stale after the Skill changes; (4) the focused
  integration command and `npm run test:scripts` must pass.
- 2026-07-19: Test seams are `prepareAiosAgentProviderExecution` with its
  explicit `evidenceRoot` and `verifySkillTrainingGate` with its explicit
  `rootDir`/`changedFiles`; no production or user-owned evidence directory is
  written.

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- Start with the first pending task.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active

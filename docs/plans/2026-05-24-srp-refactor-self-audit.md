# SRP 重构自审计报告（2026-05-24）

## 结论

当前不能宣称“全部修复完成”。本轮重构已经解决了一批大文件 facade 化问题，但项目级单一职责治理仍有阻塞项：仍有 6 个 `scripts/lib` 实现文件超过 320 行，且有 5 个 RL 实验运行产物仍处于 git 暂存区。

## 审计限制

- `code-review-graph` 审计入口两次被自动审批拦截，错误为 `stream disconnected before completion`。
- 由于 git index 写入被 sandbox 拦截，无法完成 `git restore --staged` 清理暂存区；该项必须继续处理，不能提交当前暂存状态。

## 已验证通过的部分

- 新拆分 facade 行数：
  - `scripts/lib/harness/groupchat-runtime.mjs`: 11 行
  - `scripts/lib/native/repairs.mjs`: 13 行
  - `scripts/lib/rl-shell-v1/schema.mjs`: 7 行
  - `scripts/lib/harness/orchestrator-runtimes.mjs`: 20 行
  - `scripts/lib/harness/orchestrator-evidence.mjs`: 34 行
  - `scripts/lib/harness/clarity-gate.mjs`: 24 行
  - `scripts/lib/harness/solo-journal.mjs`: 32 行
- 新拆分目录下没有超过 220 行的子模块。
- 乱码扫描已通过：按常见 mojibake/替换字符特征扫描，无命中。
- 针对性测试已通过：`node --test scripts/tests/aios-harness.test.mjs scripts/tests/groupchat-runtime.test.mjs scripts/tests/native-repairs.test.mjs scripts/tests/rl-shell-v1-schema.test.mjs scripts/tests/rl-shell-v1-temp-runner.test.mjs`，结果 `73/73` 通过。

## 阻塞项

### 1. 仍超过 320 行的实现文件

| 行数 | 文件 |
| ---: | --- |
| 617 | `scripts/lib/rl-shell-v1/run-orchestrator.mjs` |
| 594 | `scripts/lib/rl-orchestrator-v1/decision-runner.mjs` |
| 593 | `scripts/lib/rl-core/campaign-controller.mjs` |
| 564 | `scripts/lib/rl-orchestrator-v1/policy-release-gate.mjs` |
| 550 | `scripts/lib/rl-core/trainer.mjs` |
~~`scripts/lib/rl-shell-v1/temp-runner.mjs`~~ 已拆分为 facade + 9 个子模块，相关测试 `34/34` 通过。

### 2. 需要单独决策的数据文件

| 行数 | 文件 |
| ---: | --- |
| 340 | `scripts/lib/specs/model-registry.json` |

`config/skills-catalog.json` 已按用户要求作为允许超过 320 行的数据目录文件，不纳入违规。

### 3. 运行产物仍在暂存区

这些文件不应提交：

- `experiments/rl-shell-v1/campaigns/campaign-1779599620284.json`
- `experiments/rl-shell-v1/configs/benchmark-v1.invalid-tasks.json`
- `experiments/rl-shell-v1/control-state/snapshot.json`
- `experiments/rl-shell-v1/runs/phase3-1779599620252/run-summary.json`
- `experiments/rl-shell-v1/shadow-evals/shadow-1779599620283.json`

已补充 `.gitignore` 规则防止后续误跟踪，但当前暂存区清理被权限拦截，仍需执行 `git restore --staged -- <上述文件>`。

### 4. 已知验证缺口

- `scripts/tests/rl-shell-v1-orchestrator.test.mjs` 的入口训练用例此前失败，直接命令失败原因为 `insufficient-valid-tasks`。
- 这可能来自测试/训练 fixture 的基线任务状态，也可能是本次重构影响到 registry 运行路径；不能在未定位前宣称 RL shell 流程完整可用。

## 后续修复顺序

1. 清理 git 暂存区运行产物，确保不会提交 cache/runtime 文件。
2. 先拆 `scripts/lib/rl-shell-v1/temp-runner.mjs`，因为它已有独立测试且风险较低。
3. 拆 `scripts/lib/rl-shell-v1/run-orchestrator.mjs`，同时修复或确认 `insufficient-valid-tasks` 的根因。
4. 拆 `scripts/lib/rl-core/trainer.mjs` 与 `scripts/lib/rl-core/campaign-controller.mjs`。
5. 拆 `scripts/lib/rl-orchestrator-v1/decision-runner.mjs` 与 `scripts/lib/rl-orchestrator-v1/policy-release-gate.mjs`。
6. 决定 `scripts/lib/specs/model-registry.json` 是允许作为数据文件超 320 行，还是拆成多个 registry 片段。
7. 运行最终验证：超长扫描、乱码扫描、架构治理、关键 CLI/Windows 安装路径、RL shell 入口测试。

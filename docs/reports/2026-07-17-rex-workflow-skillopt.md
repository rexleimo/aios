# rex-workflow SkillOpt 稳定性报告

## 结论

`rex-workflow` Step 2 通过严格晋级门并同步为 canonical Skill：旧版验证硬分为 `0.8`，最终候选为 `1.0`；训练硬分保持 `1.0`，没有回归。target 与 scorer 均使用 `fork_turns=none` 的隔离 Agent，59 条断言都能回溯到原始回答中的精确引用。

## 可审计训练过程

| 版本 | 训练硬分 | 验证硬分 | Assertions | Gate |
|---|---:|---:|---:|---|
| 旧版 `skill_v0000` | 1.0 | 0.8 | 58/59 | baseline |
| Step 1 `skill_v0001` | 0.9 | 1.0 | 58/59 | reject_regression |
| Step 2 `skill_v0002` | 1.0 | 1.0 | 59/59 | accept_new_best |

旧版唯一失败是 `rex-valid-005 / completion-condition`：回答要求 Evidence 被接受并返回 `status=completed`，但没有明确要求 `command=null`。

Step 1 加入 compact 终态组合后修复了验证缺口，但 `rex-train-009` 的压力回答没有明确拒绝猜测、补写或伪造缺失 Evidence。由于训练分从 `1.0` 降到 `0.9`，即使验证达到 `1.0` 也被 Gate 拒绝。

Step 2 只补强状态损坏时的 Evidence 约束，重新执行全量隔离 rollout 后训练 10/10、验证 5/5、59/59 assertions 通过，因此晋级。

## 最终协议

| status | command | missingEvidence | 合法动作 |
|---|---|---|---|
| active | 非空 | 可为空或列出当前缺口 | 只执行当前 Command |
| completed | null | 空数组 | 停止并确认完成 |

其他组合统一 fail-closed：不执行残留 Provider、不声明完成，不猜测、补写或伪造缺失 Evidence；重新读取可信状态并报告矛盾。

## 场景范围

- 新任务、继续任务、新目标隔离；
- 当前 Provider 和阶段边界；
- stale token、placeholder、错误 Evidence kind；
- 单一风险 Reviewer；
- compact history 和 `--full` 边界；
- 中英文 read-only、简写/复合否定动作列表、否定子句顺序和只读后续变更目标；
- standalone discovery；
- 矛盾终态和缺失 Evidence fail-closed。

## 确定性验证

- `rex-harness`: 74/74 PASS；
- AIOS rex integration：28/28 PASS；
- AIOS training-gate：13/13 PASS，覆盖 tracked、untracked、缺失哈希和 stale hash；
- workflow-specific training gate：`verified`，score=1，accepted hash=`cdb457ea162c467cf84caa20579564db1773ccbce13d6f7fba00487f2b242bcd`；
- repo-wide `--changed` gate：正确 `blocked`；`rex-workflow` 已验证，另外 20 个本工作树中已变更的 Skill 尚未逐个完成 SkillOpt 训练；
- canonical Skill、`best_skill.md` 和 `skill_v0002.md` 的 SHA-256 一致。

仓库级阻断不是 `rex-workflow` 失败，也不能通过复用其证据消除。后续必须一次训练一个 Skill；当前优先级建议为 `rex-tdd`、`rex-code-review`、`rex-test-design`，再处理其他 Provider 与 AIOS 入口 Skill。

## 环境限制

- 顶层 `aios` CLI 和完整 `npm run test:scripts` 在启动时因本机未安装项目声明的 `yaml` 依赖而失败；没有执行 `npm install`。
- Skill Creator `quick_validate.py` 因 Python 环境缺少 PyYAML 无法运行；等价 frontmatter/Skill 契约由 Node 测试验证。
- CRG MCP 被自动审批 Guardian 的系统异常拒绝；本次使用精确读取、影响范围测试和独立 Reviewer 回退，没有绕过审批。

## 证据索引

- `.skillopt/rex-workflow-2026-07-17/baseline_raw_outputs_isolated.json`
- `.skillopt/rex-workflow-2026-07-17/baseline_assertion_results_isolated.json`
- `.skillopt/rex-workflow-2026-07-17/candidate_raw_outputs_isolated.json`
- `.skillopt/rex-workflow-2026-07-17/candidate_assertion_results_isolated.json`
- `.skillopt/rex-workflow-2026-07-17/candidate_v2_raw_outputs_isolated.json`
- `.skillopt/rex-workflow-2026-07-17/candidate_v2_assertion_results_isolated.json`
- `.skillopt/rex-workflow-2026-07-17/steps/step_0001/gate_result.json`
- `.skillopt/rex-workflow-2026-07-17/steps/step_0002/gate_result.json`
- `.skillopt/rex-workflow-2026-07-17/best_skill.md`

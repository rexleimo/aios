# rex-workflow 稳定性测试与 SkillOpt 训练计划

## 目标

在不引入新依赖、不把 MCP 变成核心协议的前提下，为 `rex-harness` 建立三层稳定性证据：

1. Node 确定性场景测试验证 CLI、状态、Capability、Command 和 Evidence 边界；
2. Agent 压力场景验证 `rex-workflow` 是否会被正确发现并严格执行当前 Command；
3. SkillOpt 对照训练只在隔离验证集硬分严格提升时晋级候选 Skill。

## 测试范围契约

### 确定性场景

- standalone：旧 token 重放、activation 不匹配、错误 Evidence kind、placeholder 引用、状态损坏、重复 work-item；
- runtime：纯解释请求不激活 Capability，失败优先于实现，提示长度不决定执行画像；
- AIOS：`team` / `harness` 只改变宿主建议，不替换当前 rex Provider；
- client：六类客户端投影、重复安装、用户同名 Skill 冲突；
- training gate：根目录和 `rex-harness/skill-sources/**/SKILL.md` 的 tracked/untracked 变更都必须被 `--changed` 发现，且训练证据哈希必须匹配当前 Skill 内容。

### Agent 行为场景

- 新任务使用 `start`，已有工作项使用 `resume`；
- 新目标即使包含“继续”也不能复用旧工作项；
- 纯问答和只读解释不创建 rex 工作项；
- 一次只加载当前 Provider，不预载固定 Matt/Superpowers/rex 链；
- stale token、状态损坏、Provider 不一致和 Evidence 无效时 fail-closed；
- `providerKind=agent` 时只按风险证据选择一名 Reviewer；
- 只有 `status=completed` 且 `command=null` 才能声明工作流完成。

## 数据集与评分

- 训练集：10 个任务，覆盖触发、恢复、Provider 边界和 Evidence 循环；
- 验证集：5 个未参与候选修改的任务，覆盖负例、混合语言、压力绕过和完成条件；
- 每个任务包含 3 到 6 个硬断言；全部满足才记 `hard=1`；
- `soft` 是通过断言比例，只用于诊断，不参与晋级决策；
- 正式 Gate 比较旧版 Skill 与候选 Skill；target 和 scorer 都使用无会话历史的隔离 Agent，候选必须满足 `candidate_validation_hard > baseline_validation_hard`；
- 训练集不得回归；原始回答、逐断言理由、精确引用、runner/model 与输入哈希必须落盘；
- 持平、验证集回归、只记忆测试措辞或代码测试失败时一律拒绝。

## 产物

- `rex-harness/skill-sources/rex-workflow/evals/evals.json`：可复用场景定义；
- `.skillopt/rex-workflow-2026-07-17/`：训练/验证任务、隔离原始输出、独立逐断言评分、版本和两步 Gate；
- `docs/reports/2026-07-17-rex-workflow-skillopt.md`：人工可读的静态评审报告；
- 只有 Gate 接受的 `best_skill.md` 才能同步回 canonical `SKILL.md`。

## 验证命令

```bash
npm --prefix rex-harness test
npm --prefix rex-harness run doctor
npm run test:rex-integration
node --test scripts/tests/ecc-uplift.test.mjs
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
node scripts/aios.mjs agents smoke --dry-run --json
git diff --check
```

若 AIOS 顶层命令仍被本机缺失依赖阻断，则运行其底层模块测试，并在报告中明确记录环境阻断，不能把“未运行”写成“通过”。

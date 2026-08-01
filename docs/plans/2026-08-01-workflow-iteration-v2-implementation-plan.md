# Workflow Iteration v2.1 落地实施计划

> 关联设计方案：`docs/plans/2026-07-31-workflow-iteration-v2-full-plan.md`
>
> 日期：2026-08-01
>
> 状态：待执行；当前工作树可能已有 P0/P-1B 未提交修改，本计划不假设工作树干净，也不要求回滚用户变更。
>
> 目标：按可观察行为增量完成 v2.1，保留每阶段 RED/GREEN、review、兼容和 rollback 证据。

---

## 1. 落地策略

不按“先把所有 Skill 写完，再补运行时”的方式推进，而按一条能贯穿所有边界的 vertical slice 先行：

```text
模糊中英文请求
  -> Requirements Capability
  -> typed Requirements Decision
  -> standalone / AIOS Evidence Envelope
  -> workflow state 持久化
  -> 下一轮 Fact derivation
  -> test-design Command
```

这条 slice 通过后，才扩展 30 条 ambiguity corpus 和 explicit intent。这样可以尽早发现以下问题：

- decision 是否真正离开原始请求文本；
- CLI、AIOS、adapter 是否使用同一份 schema；
- token、activation、stage 是否正确轮换；
- 旧 workflow JSON 是否还能恢复；
- typed decision 是否会意外触发 specialist 或绕过 TDD。

### 1.1 不变原则

- 不新增 `GRILLING_REQUIRED` workflow status。
- 不修改或清理 `agent-sources/skills/`。
- 不把 explicit intent 当成完成事实。
- 不直接手工同步六个客户端目录；canonical source 只能来自 `rex-harness/skill-sources`，target 由 managed projection 生成。
- 不自动修改用户 Memory。
- 不提交 commit，除非用户明确要求。

---

## 2. 当前工作树收口规则

当前工作树可能包含：

- 已完成但未重新验证的 P-1A/P-1B 修改；
- 已经开始的 typed Requirements Decision/P0 runtime 修改；
- 用户已有的 `agent-sources/skills/` 未跟踪目录。

执行前先建立事实清单，不覆盖、不清理未知修改：

```bash
git status --short
git diff --stat
git diff --check
git -C rex-harness status --short
git -C rex-harness diff --stat
git -C rex-harness diff --check
```

输出报告：

```text
docs/reports/2026-08-01-workflow-v2-implementation-baseline.md
```

报告至少记录：

- parent/submodule SHA；
- Node/npm 版本；
- 已修改文件分类；
- 用户既有目录/文件；
- 当前通过、失败、超时的命令；
- 尚未验证的行为；
- 本批次的允许 Modify 路径。

发现不是本线程产生的 tracked 文件修改时暂停并确认；`agent-sources/skills/` 只登记，不触碰。

---

## 3. 统一工作项和证据流程

每个实现批次使用一个独立 work item，不在同一个 activation 中混入多个 P 阶段。

### 3.1 标准步骤

1. `start/resume` 当前 work item；
2. 记录 test scope、acceptance mapping、test seam；
3. 写 testability decision：`behavior-delta`、`hardening` 或明确 blocked；
4. 写 RED 测试；必须有 non-zero receipt；
5. 实现最小变更；
6. 用同一命令获得 GREEN receipt；
7. 记录 implementation diff；
8. 做 refactor/test diff review；
9. 做独立 Standards/Spec Review；
10. 跑阶段级和全量回归；
11. 写报告并关闭 work item。

### 3.2 每批次固定证据

```text
test-scope-contract-recorded
acceptance-test-mapping-recorded
test-seam-recorded
testability-decision-recorded
failing-test-observed
red-failure-reason-recorded
passing-test-observed
implementation-diff-recorded
refactor-check-recorded
test-diff-review-recorded
standards-review-recorded
spec-review-recorded
```

Evidence ref 必须带协议前缀：`artifact:`、`receipt:`、`diff:`、`command:` 等。不能用“文件存在”“聊天说明”“未执行命令”作为绿证据。

---

## 4. 阶段总览和依赖

| 阶段 | 目标 | 依赖 | 主要产出 |
|---|---|---|---|
| L0 | 工作树和基线收口 | 无 | baseline report |
| L1 | P-1B projection 安全门 | L0 | contract/review/package 证据 |
| L2 | P0 vertical slice | L1 | typed decision domain + core round-trip |
| L3 | P0 corpus 和全边界 | L2 | 30 cases + standalone/AIOS/CLI tests |
| L4 | P1 explicit intent allowlist | L3 | intent matrix + persistence tests |
| L5 | P2 Wayfinder | L4 | Navigation Map/Decision Ticket audit |
| L6 | P3 Planning | L4 | vertical Delivery Ticket/artifact audit |
| L7 | P4 Skill audit | L5/L6 | source/eval/training/projection batch |
| L8 | P5 compatibility/privacy survey | L7 | client matrix + memory hygiene report |
| L9 | release/rollback | L1-L8 | release decision, changelog, rollback receipt |

P2 和 P3 可以并行，但必须使用独立 worktree，不能同时修改同一 `rex-harness` 目录。P4 必须等待 P2/P3 的 artifact contract 冻结。

---

# 5. L0：基线和变更边界

## L0.1 运行基线

执行实际存在的命令：

```bash
npm --prefix rex-harness test
npm --prefix rex-harness run doctor
npm run test:rex-integration
npm run test:workflow-policy
```

Parent 根目录没有 `npm test` 时，不把它当作 canonical 命令；记录实际的 `Missing script`，继续使用 package.json 中存在的测试入口。

如果全量命令超时：

- 保存超时命令和时长；
- 确认没有残留进程；
- 拆成 package、contract、integration、policy 四组；
- 不能把 timeout 计为通过。

## L0.2 完成门

- baseline report 已写入；
- 所有当前修改路径有归属；
- `agent-sources/skills/` 未被触碰；
- P-1B/P0 当前未验证项被列出；
- 没有因为基线失败而删除用户目录或放宽生产校验。

---

# 6. L1：P-1B projection 安全收口

## L1.1 先验证，后修复

先运行：

```bash
npm --prefix rex-harness run test:contract
node --test scripts/tests/rex-client-projection.test.mjs
npm --prefix rex-harness test
npm run test:rex-integration
npm pack --prefix rex-harness --dry-run
```

若命令不覆盖最新修改，重新生成 receipt；旧 receipt 不能覆盖新 diff。

## L1.2 必须确认的安全场景

| 场景 | 预期 |
|---|---|
| target 为 junction/symlink | fail-closed，不写外部目录 |
| staging 期间 target 被创建 | 保留用户目录，返回 conflict |
| staging 期间 managed target 被修改 | 保留用户内容，返回 conflict |
| forged marker | 不能授权覆盖 |
| source 后序缺失 | preflight 失败，不产生部分安装 |
| crash/recovery artifact | 保留 backup，不静默删除 |
| unknown legacy digest | 不自动 adopt |
| valid historical digest | 只允许审核过的迁移 |

## L1.3 完成门

- contract、parent projection、Rex 全量和 integration 通过；
- Windows focused ad-hoc probe 通过且脚本已清理；
- 独立只读 review 针对最新 diff；
- 没有未解决 Critical/Important；
- `projection-history.json` 中的历史 digest 有 Git 可复核来源。

L1 未完成时，不进入任何会改变 workflow route 的 P0/P1 合并批次。

---

# 7. L2：P0 vertical slice（先完成一条端到端链）

## L2.1 业务场景

固定使用一条中英文等价请求：

```text
中文：更新认证行为，让过期 session 返回 401，其他行为不变。
英文：Update authentication behavior so expired sessions return 401; other behavior remains unchanged.
```

要求：

- 初始请求不能直接生成 Requirements missing Fact，因为它没有明确“澄清前”状态；
- typed decision 提交后，decision Observation 成为权威输入；
- 下一轮选择进入 test-design 或严格 TDD，取决于结构化风险 Observation；
- standalone 和 AIOS 对同一 decision 返回相同 capability。

## L2.2 Domain slice

### 修改/创建

- `rex-harness/src/domain/requirements-decision.mjs`
- `rex-harness/src/domain/observation-kinds.mjs`
- `rex-harness/src/domain/fact-kinds.mjs`
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/application/evaluate-request.mjs`
- `rex-harness/src/index.mjs`
- `rex-harness/tests/domain/requirements-decision.test.mjs`
- `rex-harness/tests/application/request-evaluation.test.mjs`

### 先写的测试

1. valid decision normalize + JSON round-trip；
2. 空 criteria/non-goals/first slice 拒绝；
3. unknown field/kind 拒绝；
4. Observation 不引用 decisionRef 拒绝；
5. raw request + decision 并存时不重复生成 weak regex 风险 Fact；
6. decision 不含 Capability/Provider ID。

## L2.3 Core workflow slice

### 修改/创建

- `rex-harness/src/workflows/software-workflow-runtime.mjs`
- `rex-harness/src/application/advance-activation.mjs`
- `rex-harness/src/capabilities/requirements/capability.mjs`
- `rex-harness/tests/application/software-workflow-runtime.test.mjs`

### 行为

- 新 Requirements Command 的 expected evidence 增加 `requirements-decision-recorded`；
- 只在 `software.requirements.clarify` 当前 stage 接受 decision；
- 错 activation、旧 token、错误 decisionRef、越过 stage 均拒绝；
- 拒绝不轮换 token；有效 partial evidence 继续按现有规则轮换 token；
- state 中持久化 normalized decision；
- 下一次 `evaluateNext()` 使用 decision，而不是重新解析 message；
- 旧 workflow JSON 缺少 `requirementsDecision` 时按 null 读取；
- 旧 Command 缺少新 expected evidence 时继续按旧 evidence gate 恢复。

## L2.4 第一条 GREEN

完成以下最小 receipt 后才能扩大范围：

```bash
node --test \
  rex-harness/tests/domain/requirements-decision.test.mjs \
  rex-harness/tests/application/request-evaluation.test.mjs \
  rex-harness/tests/application/software-workflow-runtime.test.mjs
```

同时保存：

- 一条 typed decision RED receipt；
- 一条 typed decision GREEN receipt；
- 一条 workflow state JSON round-trip artifact。

---

# 8. L3：P0 全边界和 ambiguity corpus

## L3.1 standalone / CLI

### 修改/创建

- `rex-harness/src/standalone/store.mjs`
- `rex-harness/src/cli/evidence.mjs`
- `rex-harness/src/cli/options.mjs`
- `rex-harness/src/cli/start.mjs`（如 start 需要 decision 初始输入）
- `rex-harness/tests/standalone/standalone-cli.test.mjs`
- `rex-harness/tests/standalone/workflow-failure-modes.test.mjs`

### 测试

- `--requirements-file` 只能读 project root 内文件；
- traversal、external symlink、invalid JSON、decisionRef mismatch 拒绝；
- standalone 提交后 state、evidence ndjson、resume 都保留 decision；
- 旧 workflow 没有该字段仍可 status/resume；
- current token 错误时不写 decision、不轮换状态。

## L3.2 AIOS activation / Evidence Envelope

### 修改/创建

- `scripts/lib/workflows/rex-harness-adapter.mjs`
- `scripts/lib/workflows/rex-activation-store.mjs`
- `scripts/lib/workflows/rex-capability-runtime.mjs`
- `scripts/aios-mcp-server.mjs`
- `scripts/lib/cli/parse-args/plan.mjs`
- `scripts/lib/planning/cli.mjs`
- `scripts/tests/rex-harness-adapter.test.mjs`
- `scripts/tests/rex-activation-store.test.mjs`
- `scripts/tests/rex-capability-runtime.test.mjs`
- `scripts/tests/workflow-adapters.test.mjs`

### 测试

1. envelope 缺 `requirementsDecision`：只有在 current Command 要求时 blocked；
2. envelope 有 unknown field：fail-closed；
3. decisionRef 与 evidence ref 不一致：fail-closed；
4. valid envelope 进入 activation store 并使下一轮 Fact 读取 decision；
5. MCP、manual CLI、AIOS adapter 对同一 input 返回同一 capability；
6. Agent handoff 仍走原有 handoff schema，不把 Agent JSON 当作 Evidence Envelope；
7. tool schema 暴露 requirements decision，但不允许宿主传入 Capability/Provider override。

## L3.3 ambiguity corpus

创建：

- `rex-harness/tests/application/ambiguity-routing.test.mjs`
- `docs/reports/2026-07-31-workflow-ambiguity-corpus.md`

30 条最小分布：

- 15 条应进入 Requirements；
- 15 条不应进入 Requirements；
- 至少 7 对中英文等义样本；
- 至少 4 条 structured Observation override；
- 至少 4 条 explicit intent override；
- 至少 2 条纯解释/只读请求；
- 至少 2 条 Wayfinding 请求；
- 至少 2 条明确验收后不应继续 grilling 的请求。

每条必须记录 expected capability、reason、weak signals、false-positive note 和 evidence ref。

## L3.4 P0 完成门

```bash
npm --prefix rex-harness run test:contract
npm --prefix rex-harness test
npm --prefix rex-harness run doctor
node --test \
  rex-harness/tests/application/ambiguity-routing.test.mjs \
  rex-harness/tests/application/request-evaluation.test.mjs \
  rex-harness/tests/application/software-workflow-runtime.test.mjs \
  rex-harness/tests/standalone/standalone-cli.test.mjs \
  scripts/tests/rex-harness-adapter.test.mjs \
  scripts/tests/rex-activation-store.test.mjs \
  scripts/tests/rex-capability-runtime.test.mjs \
  scripts/tests/workflow-adapters.test.mjs
npm run test:rex-integration
npm run test:workflow-policy
```

P0 关闭前必须进行一次独立 review；P0 report 列出所有未覆盖的客户端边界和已知限制。

---

# 9. L4：P1 explicit intent allowlist

## L4.1 实施顺序

1. 先定义 `FACT.EXPLICIT_INTENT` 的 normalized value 和 unknown 行为；
2. 为每个 intent 写 capability/provider/reason/evidenceRefs matrix；
3. 在 composition root 加 allowlist；
4. 把 normalized intent 同步到 parent parser、policy、activation persistence、directive；
5. 扩展 standalone/AIOS resume 测试；
6. 再更新 Requirements/Review Skill 文案。

## L4.2 intent contract

| intent | allowlist | 安全限制 |
|---|---|---|
| `grill` | Requirements | 只问澄清问题，不产生交付事实 |
| `spec` | Requirements/spec artifact | 规格不是实现授权 |
| `tickets` | Planning | 不重开已确认 decision |
| `review` | Standards/Spec Review | 没有 diff 必须 blocked |
| `implement` | test-design/TDD/debug/minimize/implementation/review 链 | 不跳过安全链 |
| `debug` | root-cause/debug 链 | 没有可复现失败不能完成 |

## L4.3 文件

- `rex-harness/src/domain/fact-kinds.mjs`
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/composition-root.mjs`
- `rex-harness/src/cli/start.mjs`
- `rex-harness/src/cli/options.mjs`
- `scripts/lib/planning/auto-gate.mjs`
- `scripts/tests/rex-explicit-intent.test.mjs`
- `rex-harness/tests/application/request-evaluation.test.mjs`
- `rex-harness/tests/scenarios/workflow-stability.test.mjs`
- `rex-harness/tests/standalone/standalone-cli.test.mjs`
- `rex-harness/tests/contract/cli-contract.test.mjs`
- `scripts/tests/workflow-policy.test.mjs`

## L4.4 完成门

必须覆盖：

- 字符串/对象/case/空值/未知值；
- slash command、request、work-item key、resume 一致；
- `implement + behavior-change` 先 test-design；
- `review` 无 diff blocked；
- `spec` 不进入 Wayfinding；
- `tickets` 不被正文弱 regex 重新送回 Requirements；
- 完成非交付 intent 后不自动激活 implementation。

---

# 10. L5/L6：Wayfinder 和 Planning

## L5 Wayfinder

### 产出

- `rex-harness/skill-sources/rex-wayfinder/SKILL.md`
- `rex-harness/skill-sources/rex-wayfinder/evals/evals.json`
- `rex-harness/tests/skills/skill-sources.test.mjs`
- `docs/reports/2026-07-31-rex-wayfinder-map-ticket-audit.md`

### 验收

- Destination contract、Decision Graph、Unknowns 分离；
- Decision Ticket 有稳定 ID、事实、决定、后果；
- Next Slice 恰好一个；
- 无 TODO/TBD/placeholder；
- 没有真实决定时只返回 partial/blocked；
- 不新增 tracker label、assignee、child issue、自动 subagent。

## L6 Planning

### 产出

- `rex-harness/skill-sources/rex-planning/SKILL.md`
- `rex-harness/skill-sources/rex-planning/evals/evals.json`
- `rex-harness/tests/skills/skill-sources.test.mjs`
- `docs/reports/2026-07-31-rex-planning-vertical-slice-audit.md`

### 验收

- Delivery Ticket 是纵向可演示切片；
- blocker 是真实依赖；
- frontier、并行工作、汇合门可解释；
- Decision Ticket 与 Delivery Ticket 分开；
- 声称 hard completion 时，必须提供 Runtime Artifact Contract；
- 不先固化没有真实运行时消费者的 schema。

P2/P3 的 Skill source 修改必须通过 source/eval/training/projection 四件套，不能只改 SKILL.md。

---

# 11. L7：Skill audit / eval / training 批次

按小批次推进，不一次性改所有 Skill：

| 批次 | Skill | 目标 |
|---|---|---|
| S1 | requirements / implement | typed decision、self-check、停止边界 |
| S2 | debug / tdd | feedback loop、RED/GREEN、receipt |
| S3 | wayfinder / planning | map、decision ticket、vertical ticket |
| S4 | code-review / standards | diff scope、review verdict、evidence |
| S5 | 其余 rex-* | no-op、negation、sediment、完成判据 audit |

每批次必须：

1. 修改 canonical source；
2. 修改/新增 eval；
3. 运行 source contract；
4. 生成独立 quality/training artifact；
5. 运行 projection/package dry-run；
6. 只读 review；
7. 记录 rollback 文件和旧 source digest。

### 不做

- 不从 `agent-sources/skills/` 复制到生产 source；
- 不手工修改六个客户端 target；
- 不用“文案看起来更完整”作为完成证据。

---

# 12. L8：客户端兼容性和 Memory hygiene

## L8.1 客户端矩阵

对 codex、claude、gemini、opencode、hermes、grok 分别记录：

- invocation 入口；
- current Command 和 token 传递；
- Evidence Envelope/Handoff 输出方式；
- activation resume；
- projection target；
- failure/recovery；
- 缺口和兼容 shim。

产出：

```text
docs/reports/2026-07-31-client-invocation-compatibility.md
```

## L8.2 Memory survey

只调查，不执行清理：

- 分类 temporary progress、user preference、environment convention、architecture decision、secret；
- 不复制 Memory 原文进入报告；
- 不写入 commit/receipt/临时路径/阶段日志；
- 清理必须是单独授权、dry-run、备份、逐项确认。

产出：

```text
docs/reports/2026-07-31-memory-hygiene-survey.md
```

---

# 13. L9：发布和 rollback

## 13.1 发布前矩阵

```bash
npm --prefix rex-harness test
npm --prefix rex-harness run test:contract
npm --prefix rex-harness run test:skills
npm --prefix rex-harness run doctor
npm pack --prefix rex-harness --dry-run
node --test \
  scripts/tests/rex-harness-adapter.test.mjs \
  scripts/tests/rex-client-projection.test.mjs \
  scripts/tests/rex-activation-store.test.mjs \
  scripts/tests/rex-capability-runtime.test.mjs \
  scripts/tests/workflow-adapters.test.mjs \
  scripts/tests/rex-agent-provider.test.mjs \
  scripts/tests/rex-explicit-intent.test.mjs
npm run test:rex-integration
npm run test:workflow-policy
```

## 13.2 rollback rehearsal

至少演练：

1. 旧 workflow JSON resume；
2. 新 Requirements Decision schema 不被旧 Command 强制要求；
3. projection update 中断后恢复；
4. 用户修改 target 后升级不覆盖；
5. Skill source/eval/training 批次一起回滚；
6. package 中 source、eval、manifest/history 完整。

## 13.3 发布门

只有以下条件同时满足才评估版本和发布：

- L1-L8 完成；
- 无未解决 Critical/Important review；
- full tests、doctor、package dry-run、rollback 全通过；
- changelog、版本、release owner、rollback owner 明确；
- 用户明确授权发布或提交。

版本号不在计划开始时预先承诺。

---

## 14. 推荐执行节奏

### 第 1 天：收口和 vertical slice

- L0 baseline；
- P-1B fresh verification；
- P0-B domain + core workflow 最小链；
- 生成第一条 typed decision GREEN receipt。

### 第 2 天：全边界 round-trip

- standalone CLI；
- AIOS activation store；
- Evidence Envelope；
- manual planning CLI；
- MCP；
- 旧 workflow resume。

### 第 3 天：corpus 和 P0 review

- 30 条 ambiguity corpus；
- 中英文配对；
- workflow stability；
- P0 full suite；
- 独立 review。

### 第 4 天：P1 intent

- intent matrix；
- allowlist；
- resume/persistence；
- policy/CLI/adapter tests。

### 第 5-6 天：P2/P3

- 独立 worktree 并行 Wayfinder 和 Planning；
- 各自产出 audit report；
- 合并前执行 source/eval contract。

### 第 7-9 天：P4/P5

- Skill 分批 audit/eval/training/projection；
- 六客户端 compatibility matrix；
- Memory hygiene survey。

### 第 10 天：统一发布门

- full verification；
- package dry-run；
- rollback rehearsal；
- 版本评估和发布决策。

日期只是节奏参考；任何阶段没有 fresh evidence 时不得推进下一阶段。

---

## 15. 最终完成检查表

- [ ] 当前工作树和 P-1B/P0 未验证项已登记
- [ ] P-1B 无 Critical/Important 安全问题
- [ ] typed Requirements Decision domain 通过
- [ ] standalone/AIOS/CLI/MCP round-trip 通过
- [ ] 30 条 ambiguity corpus 通过
- [ ] 旧 workflow/旧 Command resume 通过
- [ ] explicit intent allowlist 通过
- [ ] Wayfinder artifact audit 通过
- [ ] Planning vertical ticket/artifact audit 通过
- [ ] Skill source/eval/training/projection 批次通过
- [ ] 六客户端 invocation matrix 完成
- [ ] Memory hygiene 只有调查结果，无自动清理
- [ ] Rex full test、parent tests、integration、policy、doctor 通过
- [ ] package dry-run 和 rollback rehearsal 通过
- [ ] 无未解决 Critical/Important review
- [ ] 用户授权版本/发布/提交

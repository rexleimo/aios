# Rex Harness 工作流优化落地方案 v2.1

> 状态：执行版草案；不是发布批准，也不是“已完成”声明
>
> 更新日期：2026-08-01
>
> 目的：把 v2 的竞品观察和产品建议，收敛成可执行、可验证、可恢复的工程迭代计划。

---

## 0. 这次再优化解决什么问题

上一版计划有四类结构性不足：

1. **把能力清单当成了实施顺序。** `debug`、`prototype`、`wayfinder`、`handoff`、`domain-model` 同时展开，却没有先完成运行时状态、证据和持久化契约。
2. **把“问澄清问题”建模成了新的 workflow status。** 这会造成第二套状态机。当前架构应继续使用 `software.requirements.clarify`，只增加 typed decision 和证据，不新增 `GRILLING_REQUIRED`。
3. **把 explicit intent 当成绕过安全链的开关。** 用户说 `implement` 只能表达入口意图，不能伪造测试、差异、审查或完成事实。
4. **把 Skill 文案、客户端投影、Memory 清理写成了低风险工作。** 实际上它们分别涉及 source ownership、发布安全和隐私边界，必须有独立完成门。

### 本版核心决策

- 一个工作项只有一个 current Command；Provider 不自行选择下一个 Provider。
- 路由链固定为：

  ```text
  Observation -> Fact -> Capability -> current Command -> typed Evidence -> next state
  ```

- Requirements 澄清结果必须是 `rex.requirements-decision.v1`，不能只存 Markdown 引用或原始用户文本。
- 用户修改过的投影、symlink/junction、TOCTOU、不确定 recovery 状态全部 fail-closed。
- explicit intent 使用 capability allowlist，不使用“直接完成”捷径。
- canonical Skill 只来自 `rex-harness/skill-sources/*`；客户端目录由 managed projection 生成，不手工复制。
- `agent-sources/skills/` 是既有用户目录，本项目不修改、不删除、不移动、不放宽生产 source-tree 校验。
- Memory 只能调查和提出人工审批建议，不能在本任务中自动清理用户 Memory。

---

## 1. 目标、非目标和成功结果

### 1.1 目标

本迭代完成后，系统应能：

1. 将中英文弱需求稳定路由到 Requirements，而不是因为风险词直接跳到 specialist 或 implementation。
2. 将用户澄清后的 acceptance criteria、non-goals、first slice 和 Observation 以 typed decision 持久化，并穿过：
   - Rex core API
   - standalone CLI
   - AIOS activation store
   - AIOS Evidence Envelope
   - manual planning CLI
3. 在六个受支持客户端上安全更新 Rex-managed Skill projection，同时保留用户修改和中断 recovery。
4. 让 `grill/spec/tickets/implement/review` 成为显式 intent 的入口语义，但不伪造下游证据。
5. 让 Wayfinder、Planning 和 Skill audit 有明确 artifact contract、eval、training/quality evidence。
6. 在发布前拥有可重跑的全量测试、package 内容检查和 rollback 演练。

### 1.2 非目标

本迭代不做以下事情：

- 不新增第二套 `GRILLING_REQUIRED` status。
- 不新增通用 tracker、assignee、child issue、自动 subagent 调度器。
- 不让 `implement` 绕过 test design、TDD、hardening、diff review 或 specialist review。
- 不把 prototype、domain-model、handoff 直接作为生产 Capability；它们先作为 deferred spike，满足进入条件后再单独立项。
- 不直接修改 `agent-sources/skills/`。
- 不自动删除、迁移或重写用户 Memory。
- 不在未完成安全 review 前升级版本或发布。

### 1.3 成功结果不是“文件存在”

每个阶段必须同时提供：

- 行为或契约测试；
- 失败原因和通过 receipt；
- 变更范围与差异 review；
- 对旧数据/旧 Command 的兼容说明；
- rollback 或恢复路径；
- 可定位的 artifact/evidence ref。

---

## 2. 执行前基线和事实校验

计划中的 commit、版本、测试数字均不是证明。执行每一批前必须重新记录实际值：

```bash
git status --short
git rev-parse HEAD
git -C rex-harness rev-parse HEAD
git diff --check
git -C rex-harness diff --check
node --version
npm --version
npm --prefix rex-harness test
npm --prefix rex-harness run doctor
npm run test:rex-integration
```

Parent 的全量脚本若耗时较长，必须使用仓库实际存在的 script 名称和明确超时；超时只能记录为 timeout，不能计为通过。

### 2.1 基线分类

把结果分成三类：

| 分类 | 含义 | 处理 |
|---|---|---|
| product failure | 生产代码或契约失败 | 建 RED，修复后重新 receipt |
| environment contamination | 既有用户目录、未跟踪 fixture 污染 | 隔离测试 fixture，不放宽生产边界 |
| verification timeout | 命令未在约定时间完成 | 保留命令和阻塞原因，拆分或延长验证 |

`agent-sources/skills/` 若导致 integration source-tree 检查失败，只允许用临时 canonical fixture 隔离测试；禁止删除目录或简单放宽 `loadCanonicalAgents`。

---

## 3. 目标运行时模型

### 3.1 单一状态机

```text
user/host input
    |
    v
structured Observation + raw request
    |
    v
Fact derivation (weak regex only as weak evidence)
    |
    v
one Capability decision
    |
    v
one current Command
    |
    v
Provider output -> typed Evidence Envelope
    |
    v
validate token/activation/stage/ref/receipt
    |
    v
persist evidence + advance exactly one state transition
```

任何 Provider 输出自然语言都不能直接推进状态；必须有 current Command 要求的 Evidence kind 和可验证 ref。

### 3.2 Requirements Decision contract

```json
{
  "schemaVersion": 1,
  "kind": "rex.requirements-decision.v1",
  "decisionRef": "artifact:requirements-decision-001",
  "acceptanceCriteria": ["用户可观察的行为"],
  "nonGoals": ["本轮明确不改变的行为"],
  "firstSlice": {
    "outcome": "一个可演示结果",
    "verification": "一个可执行命令或明确人工检查"
  },
  "observations": [
    {
      "kind": "change.behavior-requested",
      "evidenceRefs": ["artifact:requirements-decision-001"]
    }
  ]
}
```

规范：

- `decisionRef` 必须带支持的协议前缀，不能是 placeholder。
- criteria、non-goals、first slice 均不可为空。
- Observation kind 必须登记；每条 Observation 必须引用 decisionRef。
- decision 不直接写 Capability ID 或 Provider ID。
- 原始模糊文本与 decision 同时存在时，decision Observation 是权威输入，弱 regex 不重复制造冲突 Fact。
- 新 Requirements Command 增加 `requirements-decision-recorded`；旧持久化 Command 若没有此 expected evidence，按旧契约恢复。

### 3.3 Evidence Envelope contract

```text
AIOS_REX_EVIDENCE={
  "schemaVersion": 1,
  "activationId": "...",
  "evidence": [{"kind":"...","refs":["artifact:..."]}],
  "requirementsDecision": { ...typed decision... },
  "testabilityDecision": { ...existing typed decision... }
}
```

- 未知字段 fail-closed。
- `requirementsDecision` 只在 Requirements current Command 提交。
- `requirements-decision-recorded` 的 ref 必须与 `decision.decisionRef` 相同。
- CLI 使用 `--requirements-file`，不把 JSON 塞入命令行参数。
- 文件必须在 project root 内；symlink/realpath 越界也拒绝。

---

## 4. 依赖图和合并顺序

```text
P-1A baseline
    |
    v
P-1B managed projection safety
    |
    v
P0 requirements ambiguity + typed decision round-trip
    |
    v
P1 explicit intent allowlist
    |
    +------------------+
    v                  v
P2 Wayfinder       P3 Planning artifact contract
    |                  |
    +--------+---------+
             v
P4 Skill audit/eval/training
             |
             v
P5 client compatibility + memory hygiene survey
             |
             v
release/version/rollback gate
```

允许 P2/P3 在 P1 之后并行，但同一 `rex-harness` 目录不能由两个 worktree 同时修改。P4 必须等待对应 runtime/artifact contract 冻结；P5 的 Memory 部分只能做调查，不能改用户 Memory。

### 4.1 每批修改的固定顺序

1. `start`/resume 对应 Rex work item；
2. 记录 test scope、acceptance mapping、test seam；
3. 写 testability decision；
4. 写 RED 测试并获取 non-zero receipt；
5. 最小实现；
6. GREEN receipt；
7. refactor/diff review；
8. 独立 Standards/Spec Review；
9. parent/submodule 全量回归；
10. 只在完成门全满足后合并或标记完成。

---

## 5. P-1A：恢复并冻结基线

### 目标

让 source contract、parent adapter、路径断言和 integration fixture 可重复通过。

### 范围

- `rex-harness/tests/skills/skill-sources.test.mjs`
- `scripts/tests/rex-harness-adapter.test.mjs`
- `scripts/tests/rex-client-projection.test.mjs`
- `scripts/tests/rex-agent-provider.test.mjs`
- `docs/reports/*baseline*.md`

### 不变边界

- 不改变生产 Capability 选择语义。
- 不放宽 canonical source-tree 校验。
- 不接触 `agent-sources/skills/`。

### 完成门

```bash
npm --prefix rex-harness test
npm --prefix rex-harness run doctor
node --test scripts/tests/rex-harness-adapter.test.mjs \
  scripts/tests/rex-client-projection.test.mjs \
  scripts/tests/training-certification.test.mjs \
  scripts/tests/rex-planning-training-evidence.test.mjs
npm run test:rex-integration
```

必须有 baseline report，明确记录初始失败、环境污染、修复和未执行检查。

---

## 6. P-1B：Managed Rex projection/update 安全收尾

### 目标

canonical Skill source 更新时，只更新 Rex-managed 且未被用户修改的 target；不覆盖用户内容，不跟随 symlink/junction，不因并发改变而静默丢数据。

### 核心不变量

- target/source overlap fail-closed；
- `lstat` 检查 target 根和 marker，不跟随 symlink/junction；
- marker 不参与 payload digest；
- 未标记目录只有当前 canonical 或审核历史 digest 才可 adopt；
- staging 后、replace 前再次验证预期 target snapshot；
- no-replace 或等价保护失败时保留用户 target 和 backup；
- recovery artifact 不确定时返回结构化 conflict，不删除备份；
- `installed/updated/adopted/conflicts/recoveries/errors` parent 聚合保持兼容。

### 文件

- `rex-harness/src/clients/install.mjs`
- `rex-harness/src/clients/projection-manifest.mjs`
- `rex-harness/src/clients/projection-history.json`
- `rex-harness/tests/contract/client-install.test.mjs`
- `scripts/lib/rex-harness/client-projection.mjs`
- `scripts/tests/rex-client-projection.test.mjs`
- `rex-harness/docs/provider-contract.md`

### 必须覆盖的 RED/GREEN

1. 新安装、unchanged、same-content adopt；
2. managed update；
3. 用户修改后 conflict；
4. forged marker 不授权覆盖；
5. unknown legacy digest conflict；
6. source 缺失时 preflight 不发生部分写入；
7. target junction/symlink 不写到外部目录；
8. staging 期间 target 创建/修改被保留并返回 conflict；
9. 中断 staging/backup recovery；
10. Windows path、package pack、旧 marker 兼容。

### 完成门

```bash
npm --prefix rex-harness run test:contract
node --test scripts/tests/rex-client-projection.test.mjs
npm --prefix rex-harness test
npm run test:rex-integration
npm pack --prefix rex-harness --dry-run
```

必须有独立只读 review；发现 Critical/Important 后必须重新 review，不能复用旧实现的 review 结果。

---

## 7. P0：歧义路由与 typed Requirements Decision

P0 拆成三个可独立回滚的切片，不能一次性修改所有入口。

### P0-A：30 条 ambiguity corpus 和路由契约

#### 语料格式

创建：`docs/reports/2026-07-31-workflow-ambiguity-corpus.md`，并由
`rex-harness/tests/application/ambiguity-routing.test.mjs` 读取结构化 cases。每条包含：

```json
{
  "id": "cn-vague-login-01",
  "locale": "zh-CN",
  "input": "把登录逻辑改一改",
  "expectedCapability": "software.requirements.clarify",
  "expectedReason": "acceptance-criteria-missing",
  "weakSignals": ["behavior-change", "risk-domain:security"],
  "structuredOverride": false,
  "falsePositiveNote": "风险词不等于已确认的安全实现范围"
}
```

至少包含：

- 15 条应进入 Requirements：中英文弱行为请求、风险词+无验收、范围/结果缺失；
- 15 条不应进入 Requirements：明确验收、纯解释、Wayfinding、明确 structured Observation、显式 intent；
- 中文/英文语义配对；
- `explicitIntent=review` + 正文含 fix；
- `explicitIntent=implement` + 结构化高风险；
- `requirementsDecision` 已存在时弱 regex 不重复加冲突 Fact。

#### 规则

- 弱 regex 只能产生弱 Observation/Fact；不能单独制造“已确认高风险实现”。
- 结构化 Observation 和 typed decision 优先于原始文本。
- 无法稳定判断时进入 Requirements，不猜到实现或 specialist。
- 不新增 workflow status；继续复用 `software.requirements.clarify`。

#### 验证

```bash
node --test rex-harness/tests/application/ambiguity-routing.test.mjs \
  rex-harness/tests/application/request-evaluation.test.mjs \
  rex-harness/tests/scenarios/workflow-stability.test.mjs
```

### P0-B：Requirements Decision domain

#### 文件

- `rex-harness/src/domain/requirements-decision.mjs`
- `rex-harness/src/domain/observation-kinds.mjs`
- `rex-harness/src/domain/fact-kinds.mjs`
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/application/evaluate-request.mjs`
- `rex-harness/src/capabilities/requirements/capability.mjs`
- `rex-harness/tests/domain/requirements-decision.test.mjs`
- `rex-harness/tests/application/request-evaluation.test.mjs`

#### 必须覆盖

- stable JSON round-trip；
- 空 criteria/non-goals/first slice 拒绝；
- unknown field/kind/ref mismatch 拒绝；
- decision Observation 必须引用 decisionRef；
- 原始模糊请求与 decision 同时存在时，decision 权威；
- 不把 decision 写成 Capability/Provider 指令。

### P0-C：Runtime / standalone / AIOS / CLI round-trip

#### 文件

- `rex-harness/src/workflows/software-workflow-runtime.mjs`
- `rex-harness/src/standalone/store.mjs`
- `rex-harness/src/cli/evidence.mjs`
- `rex-harness/src/cli/options.mjs`
- `rex-harness/src/index.mjs`
- `scripts/lib/workflows/rex-harness-adapter.mjs`
- `scripts/lib/workflows/rex-activation-store.mjs`
- `scripts/lib/workflows/rex-capability-runtime.mjs`
- `scripts/lib/planning/cli.mjs`
- `scripts/lib/cli/parse-args/plan.mjs`
- `scripts/aios-mcp-server.mjs`
- corresponding standalone/adapter/runtime/CLI tests

#### 状态机规则

- decision 只能在 Requirements clarify current Command 提交；
- 错 activation、旧 token、越过 stage、错误 decisionRef 均拒绝；
- 拒绝不轮换 token；接受的 partial evidence 按现有契约轮换 token；
- accepted decision 写入 workflow state 和 activation artifact；
- `evaluateNext()` 使用 typed decision 的 Observation，而不是再次解析原始 message；
- 缺 decision 时新 Command blocked；旧 Command 兼容读取；
- Evidence Envelope 缺 decision、decisionRef 不一致、未知字段均 fail-closed；
- standalone、AIOS adapter、manual planning CLI 对同一输入必须选择相同 capability/decision。

#### CLI 示例

```text
rex-harness evidence \
  --activation <id> \
  --command-token <token> \
  --evidence requirements-decision-recorded=artifact:requirements-decision-001 \
  --requirements-file requirements-decision.json \
  --root <project-root>
```

#### P0 完成门

```bash
npm --prefix rex-harness run test:contract
npm --prefix rex-harness test
node --test \
  rex-harness/tests/domain/requirements-decision.test.mjs \
  rex-harness/tests/application/request-evaluation.test.mjs \
  rex-harness/tests/application/software-workflow-runtime.test.mjs \
  rex-harness/tests/standalone/standalone-cli.test.mjs \
  scripts/tests/rex-harness-adapter.test.mjs \
  scripts/tests/rex-activation-store.test.mjs \
  scripts/tests/rex-capability-runtime.test.mjs \
  scripts/tests/workflow-adapters.test.mjs
npm run test:rex-integration
```

P0 必须额外保存一条 standalone 和一条 AIOS envelope round-trip receipt，不能只看 domain unit test。

---

## 8. P1：Explicit intent 只做入口 allowlist，不绕过安全链

### 支持的 normalized intent

| intent | 允许的入口 Capability | 不允许伪造的事实 |
|---|---|---|
| `grill` | Requirements | 不产生实现完成事实 |
| `spec` | Requirements/规格产物入口 | 不授权本轮实现 |
| `tickets` | Planning | 不重新伪造 requirements decision |
| `review` | Standards/Spec Review | 没有 diff 时必须 blocked |
| `implement` | 既有安全交付链 | 不跳过 test-design/TDD/review |
| `debug` | Debug root cause | 没有可复现失败时不能声称已定位 |

### 规则

- 接受字符串和 `{intent|kind|route}`，统一 trim/lowercase；未知值保持旧行为。
- Parent parser、policy evaluation、activation persistence、directive 必须使用同一个 normalized value。
- `review` 不因正文含 `fix` 变成交付；`implement` 不因正文含风险词屏蔽风险 Fact。
- 完成 Requirements/Planning/Review 后不自动激活实现；交付必须新 work item 或显式 `implement`。
- 不新增一批 Capability ID，除非先通过 capability pack、provider binding、recipe、projection、tests、doctor 的完整设计门。

### 文件和测试

- `rex-harness/src/domain/fact-kinds.mjs`
- `rex-harness/src/application/derive-facts.mjs`
- `rex-harness/src/composition-root.mjs`
- `rex-harness/src/cli/start.mjs`
- `scripts/lib/planning/auto-gate.mjs`
- `scripts/tests/rex-explicit-intent.test.mjs`
- request-evaluation、workflow-stability、standalone、CLI contract、workflow policy tests

### 完成门

必须验证大小写、对象形式、空值、未知值、resume 丢失、intent 与正文冲突、无 diff review blocked、implement+behavior-change 先 test-design。

---

## 9. P2：Wayfinder Navigation Map / Decision Ticket / Next Slice

### 目标

`rex-wayfinder` 产出低分辨率、可审查的 Navigation Map，并收敛到恰好一个可执行 Next Slice；不复刻 tracker。

### Artifact contract

```markdown
# Navigation Map: <name>

## Destination Contract
- Outcome
- Success signals
- In scope / Non-goals
- Source refs

## Decision Graph
| ID | Question | Status | Blocked by | Refs |

## Unframed Unknowns

## Next Slice
- Exactly one ID/title
- Observable outcome
- Preconditions and decision refs
- Affected boundaries
- Acceptance checks
- Verification command/expected signal
- Evidence to retain
```

硬判据：Destination 有真实 refs；Decision Graph 无未知、自依赖、循环；facts/inferences/unknowns 分离；Next Slice 恰好一个且无 TODO/TBD/placeholder。无法诚实形成 Next Slice 时只能提交 partial evidence。

### 文件

- `rex-harness/skill-sources/rex-wayfinder/SKILL.md`
- `rex-harness/skill-sources/rex-wayfinder/evals/evals.json`
- `rex-harness/tests/skills/skill-sources.test.mjs`
- `docs/reports/2026-07-31-rex-wayfinder-map-ticket-audit.md`

### 不做

不新增 `wayfinder:map` label、assignee、child issue、自动 subagent 或完整路线图要求。

---

## 10. P3：Planning 纵向 Delivery Ticket 和 Artifact Contract

### 目标

Planning 按用户可观察行为增量拆分，跨越实际受影响边界；不按 schema/API/UI 文件横切。

### Ticket contract

```markdown
## S-01 — <observable outcome>
### Outcome
### Inputs and decision refs
### Affected boundaries
### Evidence-backed touchpoints
### Blocked by
### Acceptance criteria
### Verification / expected signal
### Shared state and concurrency
### Failure boundary and recovery point
```

### 规则

- 普通 ticket 完成后可独立演示/验证；
- blocker 必须是真依赖，不是方便的顺序；
- Decision Ticket 与 Delivery Ticket 分开；Planning 不重开已确认 decision；
- 无依赖工作保持并行，明确 frontier 和汇合门；
- 只有宣称“硬完成”时才要求 Runtime Artifact Contract；先做 schema spike，再决定是否固化。

### 文件

- `rex-harness/skill-sources/rex-planning/SKILL.md`
- `rex-harness/skill-sources/rex-planning/evals/evals.json`
- `rex-harness/tests/skills/skill-sources.test.mjs`
- `docs/reports/2026-07-31-rex-planning-vertical-slice-audit.md`
- 如实现 artifact contract，再增加对应 domain/schema/tests；不得先写空 schema。

---

## 11. P4：Skill audit、eval 和 training evidence

### 目标

不要只润色 SKILL.md；每个 Skill 变更必须同步 source、eval、training/quality artifact 和 projection/package 验证。

### Audit 维度

- 删除 no-op 行；
- 将容易被误解的否定改为正向动作/完成判据；
- 删除沉积的过期规则；
- 完成判据必须是可检查的 evidence kind/ref；
- Provider 必须声明只执行当前 Command、只提交当前 expected evidence；
- `rex-requirements` 必须一次只问一个问题并提交 typed decision；
- `rex-implement` 必须保留 self-check 和停止边界；
- `rex-code-review` 必须有 scope、diff、standards/spec verdict；
- debug/wayfinder/planning 的新结构必须有 eval，不得只复制竞品文案。

### 来源和发布边界

- canonical 修改只发生在 `rex-harness/skill-sources`；
- 不直接编辑六客户端 target；
- 由 managed projection installer 生成并验证 marker/digest；
- 不运行任何会修改 `agent-sources/skills/` 的同步命令；
- package dry-run 必须确认 source、eval、manifest/history 都进入 npm 包。

### 完成门

每批 Skill 至少包含：

```text
source contract test
+ eval JSON/schema test
+ independent quality artifact
+ projection/package verification
+ review receipt
```

---

## 12. P5：六客户端 invocation compatibility 与 Memory hygiene 调查

### 12.1 六客户端兼容性

调查并测试 codex、claude、gemini、opencode、hermes、grok：

- invocation 入口、参数、当前 Command 传递；
- Evidence Envelope 输出方式；
- activation/command token resume；
- Skill projection target 和 marker；
- 失败/中断/recovery 行为。

输出 `docs/reports/2026-07-31-client-invocation-compatibility.md`，每个客户端给出：支持、缺口、兼容 shim、验证命令和 rollback。

### 12.2 Memory hygiene

只做调查和建议：

- 统计哪些内容属于 user preference、environment convention、architecture decision、temporary progress、secret；
- 不读取或删除未授权个人 Memory；
- 不把 commit、receipt、临时路径、阶段日志写入长期 Memory；
- 任何清理操作必须单独得到用户明确授权，并且有 dry-run、备份、逐项人工确认。

输出 `docs/reports/2026-07-31-memory-hygiene-survey.md`，不直接修改 Memory。

### 完成门

- 每个客户端至少一个 invocation compatibility test 或明确 blocker；
- Memory report 不包含 secret 或用户 Memory 原文；
- 没有自动清理副作用。

---

## 13. Deferred spikes：只有满足进入条件才实施

### Prototype

只有出现至少一个真实设计决策无法通过 test-design/wayfinder 验证、且用户明确需要快速可丢弃验证时，才开 `rex-prototype`。进入前必须定义：

- prototype input/output；
- one-command verification；
- 与生产代码隔离方式；
- 不进入 main 的清理/保留策略。

### Domain model

只有 requirements decision 中出现跨 session 术语冲突，且现有 artifact refs 无法稳定解决时，才开 domain-model spike。不能默认写 `CONTEXT.md`，不能把实现细节和个人上下文混入词汇表。

### Handoff

只有存在实际 resume/context-loss failure receipt，且现有 activation/workflow artifact 无法恢复时，才设计 handoff artifact。必须先定义 secret redaction、生命周期、权限、清理和不重复 artifact 规则。

这些 spike 不属于当前主线；未满足进入条件时保持 deferred，不因“竞品有”而实现。

---

## 14. 统一完成门、证据和回滚

### 14.1 完成门

任务只有同时满足以下条件才能标记完成：

- 有精确 Modify/Create 路径和不变边界；
- 有先失败后通过的行为/契约测试，或 Skill audit 的 source/eval/training 三件套；
- Evidence ref 带协议前缀；命令 evidence 使用真实 receipt；
- 当前 Command、activation、token、stage 一致；
- `git diff --check` 和 `git -C rex-harness diff --check` 通过；
- 未触碰 `agent-sources/skills/`；
- 旧 state/旧 Command 兼容策略有测试；
- 有独立 Standards/Spec Review；
- 有 rollback/recovery 说明；
- 没有将 timeout、环境污染或 ad-hoc RED 当成 green。

### 14.2 回滚原则

- Domain/runtime：保留旧 JSON 可读性；通过 schemaVersion/optional field 回滚；不删除未知 evidence。
- Projection：保留 backup/recovery artifact；冲突时不覆盖、不清理用户 target。
- Skill：回滚 canonical source + eval + training/projection 批次，不能只回滚 SKILL.md。
- CLI/adapter：先恢复 parser/adapter compatibility，再恢复 producer；旧 Command 继续按旧 expectedEvidence。
- Release：先在 clean fixture 练习 rollback，再决定版本升级。

---

## 15. 发布前验证矩阵

### Rex 子模块

```bash
npm --prefix rex-harness test
npm --prefix rex-harness run test:contract
npm --prefix rex-harness run test:skills
npm --prefix rex-harness run doctor
npm pack --prefix rex-harness --dry-run
```

### Parent

```bash
node --test scripts/tests/rex-harness-adapter.test.mjs \
  scripts/tests/rex-client-projection.test.mjs \
  scripts/tests/rex-activation-store.test.mjs \
  scripts/tests/rex-capability-runtime.test.mjs \
  scripts/tests/workflow-adapters.test.mjs \
  scripts/tests/rex-agent-provider.test.mjs \
  scripts/tests/rex-explicit-intent.test.mjs
npm run test:rex-integration
npm run test:workflow-policy
```

若仓库没有 `npm test` 或某个 script，记录真实错误，不替换成不存在的命令名。

### 发布门

只有以下全部通过才评估版本：

1. P-1A/P-1B/P0/P1 完成门；
2. P2/P3 artifact audit 通过；
3. P4 source/eval/training/projection 批次通过；
4. P5 compatibility/memory report 通过；
5. full test、doctor、package dry-run、rollback rehearsal 通过；
6. 独立 review 无未解决 Critical/Important；
7. changelog、版本、release artifact、rollback owner 已确认。

当前不预先承诺 `0.4.x -> 0.5.0`；版本由发布门结果决定。

---

## 16. 团队分工和工作项边界

| Owner | 负责 | 不负责 |
|---|---|---|
| Runtime | Observation/Fact、Requirements Decision、workflow/CLI/adapter、P0/P1 测试 | 大规模 Skill 文案 |
| Planning/Artifact | Wayfinder、Planning ticket、artifact contract | 修改 Fact/Capability 路由 |
| Skill/Eval | source、eval、training evidence、audit | 直接改变 runtime 路由 |
| Release/Verification | baseline、projection、全量测试、package、版本、rollback | 自行改变产品语义 |
| Privacy/Memory | compatibility survey、memory classification、人工审批流程 | 未授权读取/清理/重写 Memory |

同一子模块目录禁止多个 Agent 并发写入。任何发现非本线程修改的文件，先暂停并确认，不覆盖用户改动。

---

## 17. 当前执行顺序

1. 先完成并独立 review P-1B 安全收尾；
2. 完成 P0-A corpus；
3. 完成 P0-B typed decision domain；
4. 完成 P0-C 全链路 round-trip；
5. 重新跑 Rex/parent/integration 全量，关闭 P0；
6. 实现 P1 intent allowlist；
7. 并行 P2/P3，分别产出 artifact audit；
8. P4 分批 Skill audit/eval/training/projection；
9. P5 compatibility 和 memory hygiene survey；
10. 统一发布、版本评估和 rollback rehearsal。

每一步都要保留：当前 Command、RED receipt、GREEN receipt、review ref、验证命令和阻塞说明。

---

## 18. 参考路径

- Rex core：`rex-harness/src/`
- Rex canonical Skills：`rex-harness/skill-sources/`
- Parent adapters：`scripts/lib/workflows/`
- Parent planning CLI：`scripts/lib/planning/cli.mjs`
- Parent CLI parser：`scripts/lib/cli/parse-args/plan.mjs`
- Contract tests：`rex-harness/tests/`、`scripts/tests/`
- Reports：`docs/reports/`
- 竞品只读参考：`agent-sources/skills/`（禁止修改）

本计划不把竞品目录内容、用户 Memory、聊天状态或文件存在本身当作完成证据。

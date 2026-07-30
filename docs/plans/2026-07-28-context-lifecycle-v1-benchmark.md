# Context Lifecycle V1 基准测试设计

> 工作项：`context-lifecycle-v1-benchmark-baseline`
> 状态：测试范围已定义，待执行当前版本基线
> 原则：先记录改造前真实结果，再实施，再用同一套场景重放
> 非目标：本阶段不修改产品行为，不以现有 148 个回归测试冒充效果基准

## 一、用户目标

用户需要看到的不是“新增了多少模块”，而是可重复回答：

1. 改造前具体会发生什么错误或信息缺失。
2. S0、S1、S2 各自修复了哪些可观察行为。
3. 改造后是否真的减少遗漏、过期写入、越界修改和上下文丢失。
4. 新流程是否对现有 direct/read-only 工作造成误报、阻断或明显性能退化。
5. 同一条命令和同一组 fixture 能否在改造前后重复运行并产生可比较结果。

## 二、明确非目标

本基准不做：

- 不调用真实 LLM 判断“模型是否思考过”；
- 不以 prompt 长度或内部函数调用次数代替用户行为；
- 不依赖网络、向量库、图数据库或远程服务；
- 不修改现有产品实现来让基准通过；
- 不把预期失败加入普通 `npm test`，避免主测试套件永久红灯；
- 不通过删除断言、放宽期望、跳过场景或只测试 mock 获得假通过；
- 不在基线阶段宣称完整语义压缩、预测式 anticipation 或 Team shared-canonical 已被验证。

## 三、测试范围契约

### 范围内行为

- memo provenance、scope/ACL、publish/supersede；
- session-close candidate/promotion；
- Dream proposal、archive/tombstone 与物理删除；
- planned/high-risk 修改的 required context、freshness、targets 与 ownership；
- changed-files 与实际 Git diff 的修改后对账；
- `full → summary+ref → ref-only` 表示降级；
- ContextReceipt 的 included/degraded/excluded、reason、ref 与 hash；
- handoff/continuity 的 revision 与 stale revalidation；
- mode=`off|observe` 的兼容性；
- direct/read-only 轻量路径；
- CJK 和 custom state root；
- tool/web/handoff 文本不能升级成受信控制指令。

### 范围外行为

- LLM 主观回答质量；
- learned/predictive anticipation；
- 图检索或向量检索收益；
- 全 shell 副作用拦截；
- Team shared-canonical 并发写入的正式 GA；
- 完整语义压缩准确率。

### 允许修改的测试缝

本阶段只允许新增：

- 基准 runner；
- 场景 fixture；
- baseline/target profile；
- JSON 结果与 Markdown 汇总；
- 测试辅助代码。

不允许修改：

- memo、ContextDB、planning、offload、preflight、handoff 等产品逻辑；
- 已有测试断言；
- 当前 canonical 数据格式。

### 完成判据

- 每个场景都能在隔离临时工作区重复运行。
- 每个场景记录 setup、公共入口、当前观察值、目标观察值和证据文件。
- baseline profile 在当前代码上退出 0，但必须明确记录已知失败，而不是把失败当成功。
- S0/S1/S2 profile 只有达到对应目标才退出 0。
- 所有临时工作区可清理；不修改用户真实 memo、ContextDB、Git 工作树或凭据。

## 四、基准运行模型

建议公共命令：

```text
node scripts/benchmarks/context-lifecycle-v1.mjs \
  --profile baseline|s0|s1|s2 \
  --json-out <artifact.json> \
  --markdown-out <report.md>
```

### Profile 语义

| Profile | 作用 | 退出 0 的条件 |
|---|---|---|
| `baseline` | 记录当前行为 | 当前观察值与冻结的 B0 预期一致，包括已知失败 |
| `s0` | 验证安全前置 | CL-01～CL-04 达到目标，兼容控制仍通过 |
| `s1` | 验证 Packet/Receipt observe | CL-05、CL-08、CL-10 达到目标，legacy path 不变 |
| `s2` | 验证 shadow preflight/reconciliation | CL-06、CL-07、CL-09、CL-11～CL-12 达到目标 |

baseline 的“退出 0”只表示基线成功被复现，不表示产品行为正确。每个场景还必须输出 `qualityVerdict=pass|known_failure|unknown`。

## 五、可执行场景矩阵

### CL-01——私有记录失效共享事实

**用户风险**：Agent B 的 private memo 让 Agent A 的 shared fact 消失，但 A 看不到替代内容。

**Setup**

1. 在临时 workspace 写入 Agent A 的 `project_shared` 事实。
2. Agent B 写入 `agent_private` 事实，并声明 supersede A 的 event。
3. 分别以 Agent A、Agent B 查询 live memo 和 include-invalid history。

**稳定测试缝**

- `appendMemoEvent()`；
- `listMemoEvents()`；
- 真实 file/split 临时存储，不使用 mock。

**B0 当前预期**

- Agent A 的 live 结果为空；
- history 显示 shared fact 被 B 的 private event 失效；
- `qualityVerdict=known_failure`。

**S0 目标**

- private → shared supersede 被拒绝或不生效；
- Agent A 仍能看到 shared fact；
- 产生不泄漏 B 私有内容的 DENY receipt；
- unauthorized cross-agent effect count=`0`。

### CL-02——Session Close 自动晋升未验证文本

**用户风险**：最后一段 assistant 输出中的推断直接进入 `project_shared`。

**Setup**

1. 创建包含 user、assistant 和 touched-files 的临时 session。
2. assistant 最后一句包含一个未验证的架构推断。
3. 运行真实 session-close hook。
4. 查询 shared memo。

**稳定测试缝**

- `lifecycle/session-hooks/close.mjs` 的公开运行函数；
- memo CLI/query 作为结果观察入口。

**B0 当前预期**

- assistant 文本进入 active shared recall；
- 没有 candidate/promotion 状态；
- `qualityVerdict=known_failure`。

**S0 目标**

- 只产生 candidate；
- 未 promotion 前 shared recall 中不存在该事实；
- candidate 保留 source session、touched files、producer 和 claim status；
- 明确授权 promotion 后才进入 shared recall。

### CL-03——Dream 跨所有者去重和物理删除

**用户风险**：相似 shared memo 被跨 owner 聚类，apply 重写/删除原始证据。

**Setup**

1. 写入两个 owner 不同但文本相似的 shared memo。
2. 运行 Dream preview。
3. 在临时副本运行 Dream apply。
4. 比较 apply 前后事件文件和 history。

**稳定测试缝**

- `runDream({mode:'preview'|'apply'})`；
- 真实 file 与 split 存储；
- 文件 hash 和事件数。

**B0 当前预期**

- 事件可能进入同一 dedup cluster；
- apply 会重写 JSONL 或 unlink split 文件；
- `qualityVerdict=known_failure`。

**S0 目标**

- 跨 owner 自动 dedup=`0`；
- apply 只产生 proposal/tombstone/archive；
- retention 前物理删除=`0`；
- keep/drop IDs、source hash 和 restore ref 完整。

### CL-04——Producer/Role 来源伪装

**用户风险**：Agent 生成的 memo 被固定记录为 `role:user`，正文或 CLI 自报身份可能成为可信来源。

**Setup**

1. 通过 Agent/runtime 路径写一条 memo。
2. 正文和普通参数尝试声明另一个 agent/user 身份。
3. 读取持久化 event。

**稳定测试缝**

- memo write boundary；
- runtime identity adapter；
- 持久化 JSON row。

**B0 当前预期**

- event 使用固定 `role:user`；
- 缺少可信 principal/producer/policy revision；
- `qualityVerdict=known_failure`。

**S0 目标**

- runtime identity 覆盖正文和非受信参数；
- 新 shared candidate provenance 完整率=`100%`；
- legacy row 仍可读但不能自动成为 verified hard constraint。

### CL-05——缺少必读上下文仍开始修改

**用户风险**：计划要求修改认证逻辑，但相关权限配置或测试未读，系统没有可观察提示。

**Setup**

临时 mini repo：

```text
src/auth/login.mjs
src/auth/policy.mjs
tests/auth/login.test.mjs
AGENTS.md
```

计划声明修改 `login.mjs`，并把 policy、test、AGENTS 设为 required context；执行者只读取 login。

**稳定测试缝**

- planning/work-item 公共 contract；
- future ExecutionContextPacket builder；
- readiness verdict。

**B0 当前预期**

- 当前 plan 没有 required-context contract；
- 无 `would_block=required_context_unread`；
- `qualityVerdict=known_failure`。

**S1 目标**

- observe receipt 明确列出 required refs、已读/未读和 reason；
- legacy 写入不被阻断；
- same input 的 receipt 决策可重复。

**S2 目标**

- shadow 输出 `would_block=required_context_unread`；
- required-context synthetic detection=`100%`。

### CL-06——读取后发生外部修改

**用户风险**：Agent 读取文件后，用户或另一个 Agent 修改了它，当前执行者仍依据旧内容继续写。

**Setup**

1. 读取 required file 并记录 `baseHash`。
2. 外部进程修改文件。
3. 尝试计划内 patch。
4. 再运行同一 session 的合法连续修改场景。

**稳定测试缝**

- ExecutionContextPacket read evidence；
- `preflight-contracts`；
- 真实文件 hash。

**B0 当前预期**

- 没有统一 packet freshness verdict；
- 是否失败取决于具体工具，而非统一 policy；
- `qualityVerdict=known_failure`。

**S2 目标**

- 外部修改得到 `would_block=required_context_stale`；
- 同一 session 合法写入后更新 `expectedHash`，下一次合法写不会误报；
- stale synthetic detection=`100%`，same-session false block=`0`。

### CL-07——实际修改超出声明范围

**用户风险**：计划只允许修改 auth 和测试，实际额外改了 config/payment，当前系统没有统一 drift verdict。

**Setup**

1. Packet 声明 targets/allowedWrites。
2. 在临时 Git repo 修改一个允许文件和一个未声明文件。
3. changed-files 故意漏记其中一个文件，模拟 shell coverage gap。
4. 对比 ledger 与 `git diff --name-only`。

**稳定测试缝**

- changed-files public reader；
- Git diff；
- future reconciliation evaluator。

**B0 当前预期**

- ledger 能记录部分文件，但没有 planned-vs-actual verdict；
- ledger 漏记时可能形成假通过；
- `qualityVerdict=known_failure`。

**S2 目标**

- 使用 ledger 和 Git diff 的保守并集；
- undeclared target 产生 drift receipt；
- 不自动回滚用户改动；
- undeclared synthetic detection=`100%`。

### CL-08——预算压力下静默丢失

**用户风险**：相关内容超出预算后直接消失，或 canvas compact node 没有恢复引用。

**Setup**

1. 构造多个带真实 ref 的长 context item。
2. 把关键相关项放在预算尾部。
3. 运行当前 budget/canvas compaction。
4. 检查每个 considered item 是否有表示决策和可解析 ref。

**稳定测试缝**

- `applyRecallBudget()`；
- offload ref store；
- mermaid canvas compaction；
- packet/receipt projection。

**B0 当前预期**

- 达到总预算后停止追加；
- 被排除项无 receipt；
- compact summary 可能 `ref:''`；
- `qualityVerdict=known_failure`。

**S1/S2 目标**

- 每个 considered item 恰好属于 included/degraded/excluded；
- 可恢复项按 `full→summary+ref→ref-only` 降级；
- fabricated/dangling ref=`0`；
- acceptance/verification/hard constraint 不被静默降级。

### CL-09——Handoff 使用旧 revision

**用户风险**：生成 handoff 后 plan/context 已变化，接收者仍把旧摘要当成当前事实。

**Setup**

1. 写入 handoff v2。
2. 更新 plan revision 或 required file hash。
3. 接收端读取 handoff 并尝试继续。
4. 同时验证旧 v2 fixture 仍可正常 render。

**稳定测试缝**

- `writeHandoffPacket()` / `readHandoffPacket()`；
- handoff render；
- future lineage adapter。

**B0 当前预期**

- packet 无 base/context revision；
- 接收端没有 stale verdict；
- `qualityVerdict=known_failure`。

**S2 目标**

- stale handoff 产生 revalidation requirement；
- 旧 v2 round-trip/render 不变；
- private ref 不被升级成 shared visibility。

### CL-10——Off/Observe 兼容控制

**用户风险**：增加 Context Lifecycle 后，即使关闭或只观察，也改变现有 prompt、排序、写入或数据。

**Setup**

1. 对固定 memo/search/context:pack/planning/handoff fixture 运行 mode=`off`。
2. 同一 snapshot 运行 mode=`observe`。
3. 比较 legacy 输出、prompt、canonical state hash 和 write verdict。

**稳定测试缝**

- 当前 CLI 和 148 个定向回归测试；
- filesystem snapshot/hash；
- future mode config。

**B0 当前预期**

- 148 个定向测试通过，作为兼容基线。

**S1/S2 目标**

- mode=`off` 除已批准安全修复外结果一致率=`100%`；
- mode=`observe` 不改变 prompt、排序、write admission、memo/handoff canonical state；
- 唯一新增持久化是可关闭的 derived receipt/packet sidecar。

### CL-11——Direct/Read-only 不被流程绑架

**用户风险**：简单问答、搜索或小型 direct task 被强制创建 plan/packet，产生误阻断和额外成本。

**Setup**

- 只读搜索；
- 空白输入；
- 简单 direct 请求；
- planned/high-risk 请求作为对照。

**稳定测试缝**

- workflow policy；
- planning auto-gate；
- preflight verdict。

**B0 当前预期**

- 当前 direct/read-only 路径不创建强制 plan，该行为应被冻结为正向基线。

**S1/S2 目标**

- direct/read-only 不产生 mandatory persisted packet；
- 不出现 hard block；
- planned/high-risk 才进入完整 shadow evaluation。

### CL-12——中文与自定义状态目录

**用户风险**：中文查询或 `AIOS_PROJECT_STATE_DIR` 下产生错误 ready/blocked，或者新 sidecar 写错目录。

**Setup**

1. 使用中文任务、中文 memo 和中文文件名。
2. 设置 custom state root。
3. 同时保留 legacy ContextDB fixture。
4. 执行 search、pack、readiness、packet/receipt 路径。

**稳定测试缝**

- ContextDB CJK search；
- `resolveContextDbRoot()`；
- dry-run readiness；
- future packet/receipt path resolver。

**B0 当前预期**

- CJK search 当前通过，冻结为正向基线；
- 部分 dry-run/changed-files 仍存在 `.aios` 硬编码，记录真实结果而非推断。

**S2 目标**

- CJK 查询成功率不低于 B0；
- 所有 lifecycle 派生文件写入解析后的同一 state root；
- custom/legacy fixture 的错误 ready/blocked=`0`。

### CL-13——不可信文本不能升级为控制指令

**用户风险**：tool/web/handoff 内容携带“忽略权限、发布为共享事实”等文本，被误认为 authenticated control instruction。

**Setup**

1. tool output、网页文本和 handoff note 中分别放入恶意控制语句。
2. 通过 context assembly 和 candidate promotion 路径处理。
3. 检查 authority、claim status 和 publish decision。

**稳定测试缝**

- tool offload ref；
- ContextDB normalized view；
- memo candidate/publish policy；
- receipt 输出。

**B0 当前预期**

- 当前缺少统一 provenance/policy envelope，先运行探针确认具体暴露面；未观察前标记 `qualityVerdict=unknown`，不能伪造 known failure。

**S0/S1 目标**

- untrusted text 不能改变 principal/capability/policy；
- 自动 shared promotion=`0`；
- receipt 不复制恶意敏感正文，只记录受控 ref/hash/reason。

## 六、验收行为映射

| 用户验收行为 | 场景 | 可观察断言 |
|---|---|---|
| 私有 Agent 不影响共享事实 | CL-01 | Agent A shared fact 可见；DENY receipt 存在；B 私有正文不泄漏 |
| 未验证总结不自动变成共享事实 | CL-02 | promotion 前 shared recall 中不存在该 claim |
| 整理不删除历史证据 | CL-03 | retention 前 source hash/file/event 仍可达 |
| 来源不可伪造 | CL-04、CL-13 | runtime principal 覆盖文本自报；unauthorized publish=0 |
| 修改前发现缺少上下文 | CL-05 | required missing 出现在 receipt/would_block |
| 修改前发现内容过期 | CL-06 | stale hash 被检测；合法连续修改不误报 |
| 修改后发现越界 | CL-07 | actual-vs-declared drift receipt 完整 |
| 预算不足不静默消失 | CL-08 | 每个 considered item 有 representation/reason/ref |
| Handoff 不使用旧事实继续 | CL-09 | revision drift 触发 revalidation |
| 新能力关闭时不破坏旧行为 | CL-10 | off/observe 与兼容基线一致 |
| 简单任务保持简单 | CL-11 | direct/read-only 无 mandatory packet/hard block |
| 中国用户和自定义目录可正常使用 | CL-12 | CJK 不退化；state path 正确 |

## 七、指标与门槛

### 安全硬指标

- unauthorized cross-agent hide/leak/supersede/delete：`0`；
- unauthorized shared publish/promotion/purge：`0`；
- Dream retention 前物理删除：`0`；
- provenance 缺失的新 shared candidate：`0`；
- denied-context 正文泄漏：`0`。

### 上下文效果指标

- 合成 required-context miss 检出率：`100%`；
- 合成 stale context 检出率：`100%`；
- 合成 undeclared write drift 检出率：`100%`；
- degraded item 真实 ref/hash 可解析率：`100%`；
- stale handoff revalidation：`100%`；
- direct/read-only hard block：`0`。

### 兼容指标

- 当前 148 个定向回归测试：全部通过；
- mode=`off` 非安全行为差异：`0`；
- mode=`observe` 对 prompt、排序、write admission 和 canonical state 的差异：`0`；
- plan v1/v2、memo v1、continuity v1、handoff v1/v2 读取成功率：`100%`。

### 真实任务门槛

在考虑 S3 enforcement 前，至少积累：

- 20 个真实计划型任务；
- 200 次 mutation/receipt 样本；
- 人工确认的 false-positive `<=1%`；
- 固定任务成功率相对 baseline 下降 `<=1 percentage point`；
- 任何无法解释的 hard-block reason 都阻止升级 enforcement。

## 八、测试缝选择

### 优先公共入口

1. `node scripts/aios.mjs memo ...`；
2. ContextDB CLI / `context:pack` / search；
3. planning/workflow public API；
4. handoff public read/write/render；
5. Dream public preview/apply；
6. Git diff 和 changed-files public report。

### 必要时使用窄缝

只有为隔离安全风险时使用：

- memo storage event/query functions；
- session-close hook runner；
- `applyRecallBudget()`；
- preflight evaluator；
- offload ref store。

所有窄缝仍使用真实 filesystem 临时目录，不用 mock 替代持久化、权限、hash 或时间语义。

## 九、结果工件

每次运行生成：

```text
artifacts/context-lifecycle-v1/<run-id>/
  run-summary.json
  scenario-results.jsonl
  baseline-vs-target.md
  receipts/
  fixture-hashes.json
```

结果至少包含：

- Git commit；
- profile；
- Node/OS；
- scenario ID；
- setup hash；
- command/public seam；
- expected observation；
- actual observation；
- `qualityVerdict`；
- receipt/artifact refs；
- cleanup result。

## 十、最小纵向切片

第一批先实现并运行以下 6 个场景：

```text
CL-01 private supersede shared
CL-02 session summary auto-promotion
CL-03 Dream destructive apply
CL-05 required context missing
CL-06 stale context
CL-10 off/observe compatibility
```

它们覆盖：

- 当前已确认的两个安全/数据损失风险；
- V1 最核心的修改前上下文价值；
- 新能力不破坏现有行为的兼容门。

只有这 6 个场景能稳定复现并形成 baseline artifact 后，才扩展 CL-04、CL-07～CL-09、CL-11～CL-13，也才允许开始 S0 产品实现。

## 十一、完成判据

测试设计阶段完成需要：

- 测试范围契约已记录；
- 13 个场景都有验收行为映射；
- 公共入口和必要窄缝已明确；
- baseline/S0/S1/S2 的退出条件已明确；
- 最小 6 场景和结果工件格式已明确；
- 明确禁止用已有 148 个回归测试替代效果基准。

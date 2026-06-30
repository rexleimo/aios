# harness-cli 项目对 Hermes Agent 的价值分析

> **For Hermes:** 本文档是分析型计划，不是实施计划。目标是梳理 harness-cli 中哪些能力可以直接反馈给 Hermes Agent 生态，让 Hermes 用户受益。

**目标:** 从代码结构出发，系统梳理 harness-cli 项目中已经具备的、对 Hermes Agent 用户有实际帮助的能力模块，并评估哪些可以提炼为 Hermes 原生 skill/plugin。

**架构:** harness-cli 是一个 local-first AI agent workspace，核心围绕浏览器自动化 MCP + ContextDB 会话持久化 + 多客户端 orchestration。项目已经部分与 Hermes 生态打通（`.hermes-tmp` 目录、AGENTS.md 中引用 Hermes skill 体系）。

**技术栈:** TypeScript/JavaScript (MCP server + CLI), Python (skill 工具链 + browser bootstrap), Shell (安装脚本 + MCP launcher)

---

## 一、代码库结构概览（来自 code-review-graph）

| Community | 节点数 | 核心职责 | 对 Hermes 的价值 |
|-----------|--------|----------|-----------------|
| harness-normalize (`scripts/lib`) | 3158 | CLI 解析、doctor、dispatch、orchestrate、learn-eval | **高** — 多客户端编排、doctor 健康检查 |
| tests-when | 1611 | 全面测试覆盖 | 中 — 可提炼为测试方法论 skill |
| contextdb-normalize (`mcp-server/src`) | 305 | ContextDB + browser MCP + snapshot | **高** — 会话持久化、浏览器语义快照 |
| src-should (`packages/debug-hub`) | 201 | DebugHub SDK + App | 中 — agent 日志收集/调试面板 |
| scripts-resolve (`scripts/`) | 134 | AIOS 入口脚本、MCP proxy、auth tools | **高** — MCP 代理拦截、auth gate |
| scripts-skill (`skill-sources/.system`) | 46 | skill 创建/安装/验证 | **高** — skill 管理工具链 |
| shared-cli (`src/shared`) | 6 | normalize + CLI parser 基础 | 低 — 通用工具函数 |
| pptxgenjs-helpers | 79 | PPT 生成 | 低 — 垂直领域 |
| lib-default (`skill-sources/harness-init-runner`) | 31 | harness 运行模板 + human-gate | **高** — 长时间运行 human-in-the-loop |
| scripts-json (`skill-sources/rexai-image-generation`) | 30 | 图像生成 skill | 中 — 已是 skill 形态 |
| scripts-parse (`mcp-server/scripts`) | 21 | ContextDB benchmark + Node 版本解析 | 低 |

---

## 二、对 Hermes 有直接帮助的能力模块

### 2.1 ContextDB 会话持久化系统

**位置:** `mcp-server/src/contextdb/`

**核心功能:**
- 会话创建/追加事件/写 checkpoint (`createSession`, `appendEvent`, `writeCheckpoint`)
- 会话召回搜索 (`recallSessions`, `searchEvents`, `searchCheckpoints`)
- SQLite sidecar 加速索引 (`sqlite/events.ts`, `sqlite/checkpoints.ts`, `sqlite/sessions.ts`)
- FTS5 全文检索 (`search-query.ts`, `toFtsMatchQuery`)
- Token budget 策略化压缩 (`selectEventsWithTokenBudget`, `compressEventText`, `safeCompressEventText`)
- 血缘图谱可视化 (`genealogy.ts`, `buildMemoryGenealogyGraph`)
- 语义重排序 (`semantic.ts`, `semanticRerank`, `TokenSemanticProvider`)
- Hygiene 噪音清理 (`hygiene.ts`, `pruneNoise`, `compactContextDb`)

**对 Hermes 的价值:**
Hermes 有 `session_search` 和 `memory` 工具，但缺少：
1. **跨客户端会话持久化** — ContextDB 用 JSONL + SQLite 双写，比 Hermes 纯 SQLite 更 robust（JSONL 是人类可读的 fallback）
2. **Token budget 策略化召回** — `selectEventsWithTokenBudget` 按 `legacy | balanced | aggressive` 三档策略裁剪，Hermes 的 `session_search` 没有等价物
3. **语义重排序** — `TokenSemanticProvider` + `semanticRerank` 在 recall 时做语义优先排序，Hermes 只做 FTS5
4. **血缘图谱** — `buildMemoryGenealogyGraph` 追踪 event → checkpoint → continuity 的因果链，比 Hermes 的线性 session 更有结构

**提炼建议:**
- 将 ContextDB 的 token-budget 召回逻辑提炼为 Hermes skill（`context-pack` skill），让 Hermes agent 可以在长会话中使用策略化上下文压缩
- 语义重排序可封装为 Hermes plugin，增强 `session_search` 的召回质量
- JSONL + SQLite 双写模式可作为 Hermes session DB 的架构升级参考

### 2.2 MCP 代理拦截层（Interception Runtime）

**位置:** `scripts/aios-mcp-proxy.mjs`, `scripts/lib/intercept/`

**核心功能:**
- `createProxyHandlerForServer` — 对 MCP server 做 JSON-RPC 代理拦截
- `interceptToolResult` — 大输出自动压缩为 compact packet（`_meta.aios` + raw refs）
- Token 压缩三档: `tight | ultra | precise`

**对 Hermes 的价值:**
Hermes 的 `delegate_task` 和工具输出直接进入 context window，没有中间拦截层。MCP proxy 提供了：
1. **自动输出压缩** — 大型工具输出（浏览器 screenshot、长 shell 输出）在进入 agent context 前先压缩，节省 token
2. **raw refs 模式** — 大内容不进 context，只存 ref ID，agent 需要时按需 fetch
3. **双端压缩 metric** — `pre_send` + `post_receive` 的 token 节省计量

**提炼建议:**
- 将 MCP proxy 的拦截逻辑提炼为 Hermes 的中间件模式（类似 Express middleware），在 `tool_result` 进入 context 前做压缩
- raw refs 可以作为 Hermes 的 `session_search` 补充 — 大型工具输出存 ref，搜索时只匹配 ref metadata

### 2.3 多客户端 Orchestration + Doctor

**位置:** `scripts/lib/cli/dispatch.mjs`, `scripts/lib/doctor/`

**核心功能:**
- `createAiosDispatch` — 生成 Claude/Codex/OpenCode/Gemini/Antigravity/Crush 等多客户端的 dispatch 配置（hub node: 142 edges）
- `runDoctorSuite` — 健康检查聚合（MCP 配置、Node 版本、ContextDB 状态、客户端 smoke）
- `runOrchestrate` — 多客户端并行编排 + evidence 持久化
- `buildLearnEvalReport` — 学习评估报告生成

**对 Hermes 的价值:**
Hermes 有 `delegate_task` 和 `cronjob`，但缺少：
1. **多客户端编排** — Hermes 只能派 Hermes 子 agent，不能跨 Claude/Codex/Gemini 编排。harness-cli 的 orchestrate 可以同时启动多个不同 AI 客户端协作
2. **Doctor 健康检查** — `runDoctorSuite` 检查 MCP 配置、Node 版本、数据库完整性，比 Hermes 的零散 debug 更系统化
3. **Evidence 持久化** — 每次编排都把 evidence 写入 ContextDB，形成可追溯的因果链

**提炼建议:**
- Doctor 模式可提炼为 Hermes skill（`hermes-doctor`），系统检查 Hermes 配置（model、provider、MCP、cron、memory）
- 多客户端编排理念可以作为 Hermes `delegate_task` 的扩展方向 — 支持 ACP 命令行子 agent（如 Codex CLI）而非只能用 Hermes 自己的 subagent

### 2.4 Skill 管理工具链

**位置:** `skill-sources/.system/`

**核心功能:**
- `skill-creator/init_skill.py` — 从模板初始化 skill 目录结构
- `skill-creator/quick_validate.py` — 验证 SKILL.md frontmatter + 内容完整性
- `skill-creator/generate_openai_yaml.py` — 生成 OpenAI compatible YAML 配置
- `skill-installer/install-skill-from-github.py` — 从 GitHub sparse checkout 安装 skill
- `skill-installer/list-skills.py` — 列出已安装 + 可安装的 skill

**对 Hermes 的价值:**
Hermes 有 `skill_manage` 和 `skills_list`，但功能偏基础。harness-cli 的 skill 工具链提供了：
1. **结构验证** — `quick_validate` 检查 frontmatter 必须字段（name, description, version, author），Hermes 的 `skill_manage` 不做内容验证
2. **GitHub 安装** — sparse checkout 从远程仓库安装 skill，Hermes 只能本地创建
3. **OpenAI YAML 生成** — 自动将 SKILL.md 转为 OpenAI 格式，便于跨平台复用

**提炼建议:**
- `quick_validate` 逻辑可融入 Hermes `skill_manage(action='create')` 的验证步骤
- `install-skill-from-github` 可提炼为 Hermes skill 或 CLI 子命令，让用户一行命令安装社区 skill

### 2.5 Human-in-the-Loop Gate (Harness Runner)

**位置:** `skill-sources/harness-init-runner/`

**核心功能:**
- `evaluateHumanGate` — 根据 action 样本自动判断是否需要人类确认
- `buildDecision` / `buildQuestion` — 构造 gate decision 和确认问题
- `writeCheckpointArtifacts` — checkpoint 持久化
- `buildProviderCommand` — 生成不同 AI 客户端的启动命令
- 多 provider 支持: Claude, Codex, Gemini, OpenCode

**对 Hermes 的价值:**
Hermes 的 `delegate_task` 是"fire and forget"，没有中间 human gate：
1. **自动风险检测** — `isNegatedRiskSample` + `isExplicitBoundaryAction` 自动识别需要人类确认的高风险操作
2. **结构化 checkpoint** — 每个迭代都写 checkpoint，支持断点恢复
3. **多 provider 启动** — 一套模板适配所有 AI 客户端

**提炼建议:**
- Human gate 逻辑可提炼为 Hermes 的 `delegate_task` 安全层 — 在子 agent 执行高风险操作前暂停请求人类确认
- checkpoint 恢复可作为 Hermes cron job 或长时间 delegate 的断点续传参考

### 2.6 Browser MCP 语义快照

**位置:** `mcp-server/src/browser/actions/snapshot.ts`

**核心功能:**
- `collectHybridLayoutSnapshot` — 混合布局 + accessibility tree 双层快照
- `compactRlSnapshot` — 紧凑化浏览器页面快照
- `buildAxSnapshotFromCdpNodes` — CDP accessibility node → 线性文本
- `guessPageType` — 自动判断页面类型
- `normalizeBoxToViewport` — viewport 坐标归一化

**对 Hermes 的价值:**
如果 Hermes 用户使用 browser MCP，语义快照比全页截图/HTML 节省 10-50x token：
1. **AX tree 快照** — 只输出可见、可交互元素的 role + name + bounding box
2. **紧凑格式** — `compactRlSnapshot` 输出每行一个元素，便于 agent 解析
3. **页面类型推断** — `guessPageType` 自动判断是登录页/列表页/详情页，帮助 agent 选择策略

**提炼建议:**
- 如果 Hermes 未来支持 browser MCP，snapshot 逻辑可直接复用
- 页面类型推断可作为通用 skill — 让任何 agent 在接触网页前先推断类型

### 2.7 Auth/Challenge Gate

**位置:** `mcp-server/src/browser/auth.ts`, `mcp-server/src/browser/actions/challenge-check.ts`

**核心功能:**
- `detectAuthRequired` — 检测页面是否需要登录
- `detectChallengeRequired` — 检测 CAPTCHA/验证码
- `classifyChallenge` — 分类 challenge 类型
- `buildHumanActionHint` — 构造人类操作提示

**对 Hermes 的价值:**
Hermes 如果做 browser 自动化，auth gate 是必备：
1. **自动检测** — 不需要人工判断页面是否有 auth wall
2. **分类** — 区分 login vs CAPTCHA vs rate limit
3. **human-in-the-loop** — 遇到 auth wall 自动暂停请求人类介入

**提炼建议:**
- Auth/challenge 检测逻辑可封装为 Hermes browser skill 的前置 gate

---

## 三、Hub Node 分析（对 Hermes 最关键的重用点）

| Hub Node | 度数 | 意义 | Hermes 复用方向 |
|----------|------|------|-----------------|
| `normalizeText` (shared) | 371 | 最广泛使用的文本标准化 | 直接提取为 Hermes utility skill |
| `parseArgs` (CLI) | 306 | 多命令 CLI 解析 | Hermes CLI 扩展参考 |
| `buildContextPacket` (ContextDB) | 126 | 上下文打包核心 | **最高价值** — Hermes session 压缩 |
| `runOrchestrate` | 120 | 多客户端编排入口 | Hermes 多 agent orchestration 参考 |
| `createAiosDispatch` | 142 | 多客户端配置生成 | Hermes 跨客户端集成参考 |

---

## 四、提炼路径优先级

按"对 Hermes 用户价值 × 实现难度"排序：

| 优先级 | 模块 | 价值 | 颜色 | 提炼方式 |
|--------|------|------|------|----------|
| P0 | ContextDB token-budget 召回 | 极高 | 低 | 独立 skill，纯逻辑提取 |
| P0 | Doctor 健康检查 | 高 | 低 | Hermes skill，直接复用逻辑 |
| P1 | MCP proxy 拦截压缩 | 高 | 中 | Hermes 中间件/plugin |
| P1 | Skill 验证 + GitHub 安装 | 高 | 低 | 增强 skill_manage |
| P1 | Human gate (风险检测) | 高 | 中 | delegate_task 安全层 |
| P2 | 多客户端编排 | 高 | 高 | 需 Hermes 核心架构扩展 |
| P2 | Browser 语义快照 | 中 | 中 | 依赖 browser MCP |
| P2 | Auth/challenge gate | 中 | 中 | 依赖 browser MCP |
| P3 | PPT 生成 | 低 | 低 | 已是 skill 形态 |
| P3 | DebugHub | 中 | 中 | 需前端配套 |

---

## 五、具体可执行的第一步

### 5.1 提炼 `context-pack` skill（P0）

将 `mcp-server/src/contextdb/core.ts` 中的 `selectEventsWithTokenBudget` + `compressEventText` + `safeCompressEventText` 提炼为独立 Hermes skill：

- 输入: Hermes session 事件列表 + token budget
- 输出: 压缩后的上下文包
- 策略: `legacy` (尾部截断) / `balanced` (优先级排序) / `aggressive` (只保留关键信号)

### 5.2 提炼 `hermes-doctor` skill（P0）

将 `scripts/lib/doctor/aggregate.mjs` 的 `runDoctorSuite` 逻辑提炼为 Hermes skill：

- 检查项: model provider 配置、MCP server 连通性、memory 完整性、cron 状态、skill 目录结构
- 输出: 结构化健康报告 + 修复建议

### 5.3 增强 `skill_manage` 验证（P1）

将 `skill-sources/.system/skill-creator/scripts/quick_validate.py` 的验证逻辑融入 Hermes：

- 必须字段检查: name, description, version, author, platforms
- 内容完整性: 检查是否有实际步骤（不只是标题）
- 文件引用验证: references/templates/scripts 路径存在性

---

## 六、风险与开放问题

1. **ContextDB vs Hermes session_search 的重叠** — 两者都做会话检索，但数据格式不同（JSONL+SQLite vs 纯 SQLite）。需要决定是并行引入还是逐步迁移。
2. **MCP proxy 需要 Hermes 核心架构改动** — 目前 Hermes 的 tool_result 直接进入 context，要加拦截层需要改 agent runtime。
3. **多客户端编排 vs Hermes ACP** — Hermes 已经支持 ACP（如 Copilot CLI），但 harness-cli 的编排更成熟（evidence 持久化 + checkpoint 恢复 + human gate）。如何融合两者？
4. **Skill 格式兼容** — harness-cli 用 SKILL.md frontmatter，Hermes 也用 SKILL.md，但字段定义可能有细微差异。需要做格式映射。

---

## 七、结论

harness-cli 项目对 Hermes Agent 的核心价值集中在三个方向：

1. **上下文管理** — ContextDB 的策略化召回、压缩、血缘追踪，直接填补 Hermes 长会话的上下文衰减问题
2. **安全编排** — Human gate + auth gate + doctor 检查，补齐 Hermes 在长时间自主运行中的安全缺失
3. **Skill 生态** — skill 创建/验证/安装工具链，增强 Hermes skill 系统的完整性和社区可达性

最高 ROI 的第一步是提炼 `context-pack` skill 和 `hermes-doctor` skill — 纯逻辑提取，不依赖架构改动，直接让所有 Hermes 用户受益。

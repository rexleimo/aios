# 竞品 Benchmark 规划

> 基线版本：5.3.0 · 制定日期：2026-07-30
> 目的：产出**可复现、可反驳、可发表**的对比数据，支撑 `/claude-code-vs-codex-vs-gemini/` 与「agent 记忆方案怎么选」两篇入口文
> 关联：`docs/plans/2026-07-30-docs-seo-geo-growth-plan.md`（内容规划）、`docs/plans/2026-07-28-context-lifecycle-v1-benchmark.md`（内部基准，方法论沿用）

---

## 0. 为什么要先做规划而不是直接跑

对比类内容是最强的流量入口，也是**风险最高的内容类型**。做砸的两种方式：

1. **数据站不住**：对手（或对手的用户）指出测法有利于自己 → 一次翻车抵掉十篇好文的信誉。
2. **测了但没法发**：跑出一堆数字，发现关键项依赖 LLM 随机性或网络服务，无法复现 → 白干。

所以先定方法、先定红线，再跑数。本文档不产出任何数字，只定义**怎么产出数字**。

---

## 1. 目标与非目标

### 目标

1. 对 Harness CLI 的**记忆层**（ContextDB）和**工作流层**（rex-harness）分别给出与主流替代方案的可比数据。
2. 每个数字满足：**定义清晰 / 命令可复现 / 环境可声明 / 方差可报告**。
3. 产出可被 AI 答案引擎引用的结构化结论（对应 GEO 需求：具体数字 + 测量方法 + 版本号 + 日期）。
4. 结果不利于自己的项目**照实公布**——这是这类内容唯一的可信度来源。

### 非目标

- 不产出"综合评分""总分第一"这类合成指标。合成指标是最容易被攻击的靶子。
- 不测"哪个 agent 更聪明"。那是模型能力，不是这几个项目的差异。
- 不做付费/闭源产品的逆向测试（无源码 = 无法复现 = 不发）。
- 不在同一篇文章里混合 Tier A 和 Tier B 数据而不加标注。

---

## 2. 两条赛道

本地 `temp/competitor-repos/` 已有 12 个仓库源码，天然分成两组。

> ⚠️ `temp/` 在 `.gitignore` 内。正式跑基准前必须把每个对手的 **commit SHA + 版本号 + 抓取日期**写入 `experiments/competitive-benchmark/pinned-refs.json`，否则结果不可复现。

### 赛道 A：Agent 记忆层

| 对手 | 本地路径 | 定位 | 可比性 |
| --- | --- | --- | --- |
| **mem0** | `mem0ai__mem0/` | 记忆层 SDK + 托管服务 | 高（最直接对手） |
| **Letta (MemGPT)** | `letta-ai__letta-code/` | 有状态 agent + 分层记忆 | 高 |
| **Graphiti (Zep)** | `getzep__graphiti/` | 时序知识图谱记忆 | 中高 |
| **TencentDB Agent Memory** | `TencentCloud__TencentDB-Agent-Memory/` | 云数据库记忆方案 | 中（中文市场对标价值高） |
| **OpenViking** | `volcengine__OpenViking/` | 向量/检索基座 | 中 |

对照物：`ContextDB`（本项目）。

### 赛道 B：Coding Agent 工作流 / Harness 层

| 对手 | 本地路径 | 定位 | 可比性 |
| --- | --- | --- | --- |
| **Superpowers** | `obra__superpowers/` | 技能化工作流（本项目 5.0 之前的组件，最有故事性） | 高 |
| **OpenHarness** | `HKUDS__OpenHarness/` | harness 框架 | 高 |
| **Hermes Agent** | `NousResearch__hermes-agent/` | agent 编排（本项目已作为 client 支持） | 中高 |
| **oh-my-openagent** | `code-yeongyu__oh-my-openagent/` | CLI agent 增强层 | 中 |
| **openclaw** | `openclaw__openclaw/` | Claude Code 增强 | 中 |
| **ECC** | `affaan-m__ecc/` | 上下文压缩（本项目已有 ECC uplift，`v2.0.2`） | 中 |

对照物：`rex-harness` + AIOS 工作流策略。

**赛道 B 优先级高于赛道 A**——它对应产品的核心差异（工作流策略 + 验证门禁），而记忆层是红海。但赛道 A 的搜索需求更大。**建议先发赛道 A 引流，赛道 B 做深度。**

---

## 3. 分层设计：Tier A / Tier B

这是整个规划的核心决策。

现有内部基准（`docs/plans/2026-07-28-context-lifecycle-v1-benchmark.md`）的原则是：
> 不调用真实 LLM / 不依赖网络、向量库、图数据库或远程服务

这个原则**不能直接套到竞品对比上**——mem0 / Letta / Graphiti 的核心路径本身就需要 LLM + 向量库或图库。强行剥离等于测一个残缺版本，反而不公平。

所以拆两层，**分别报告，绝不混算**：

### Tier A — 确定性指标（无 LLM、无网络）

可 100% 复现，是文章的主体数据，也是最难被反驳的部分。

| 指标 | 定义 | 测量方法 | 单位 | 争议风险 |
| --- | --- | --- | --- | --- |
| A1 安装体积 | 全新环境安装后磁盘占用增量 | 干净容器 → 安装 → `du -sb` 差值 | MB | 低 |
| A2 依赖数 | 传递依赖总数 | `npm ls --all` / `pip list` 计数 | 个 | 低 |
| A3 外部服务依赖 | 最小可用配置需要几个外部服务 | 读官方 quickstart，逐项列举（LLM API / 向量库 / 图库 / 云账号） | 个 | **低但杀伤力最大** |
| A4 离线可用性 | 断网后核心写入+检索能否完成 | 容器 `--network none` 跑 fixture | 是/否/部分 | 低 |
| A5 冷启动延迟 | 进程启动到可接受第一次写入 | 10 次取中位数 + p95 | ms | 中（需声明硬件） |
| A6 写入延迟 | 单条记忆写入 | 100 次，中位数 + p95 | ms | 中 |
| A7 检索延迟 | 单次检索（同规模语料） | 100 次，中位数 + p95 | ms | 中 |
| A8 存储放大率 | 落盘体积 ÷ 原始文本体积 | 同一 fixture 写入后量测 | × | 低 |
| A9 上下文包 token 数 | 同一查询下注入 prompt 的 token 数 | `tiktoken`/`@anthropic-ai/tokenizer` 统一计数 | tokens | **中高（必须统一 tokenizer）** |
| A10 数据出站 | 默认配置下是否有网络出站 | 容器内抓包（`tcpdump`），记录目标域名 | 域名列表 | 低，**叙事价值极高** |

A3 / A4 / A10 是本项目的结构性优势（local-first），且**完全确定性、无法被质疑**。这三项应该是文章的骨架。

### Tier B — LLM-in-the-loop 指标（需严格协议）

有说服力但有随机性。发布必须带完整协议声明，否则不发。

| 指标 | 定义 | 协议要求 |
| --- | --- | --- |
| B1 跨会话召回率 | 第 1 会话写入 N 条事实，第 5 会话提问，正确召回比例 | 固定模型 + `temperature=0` + **每条跑 5 次** + 报告均值±标准差 |
| B2 任务完成率 | 固定 20 个多步编码任务的通过率 | 同上，判定用**确定性断言**（测试通过/文件存在/命令退出码），不用 LLM 当裁判 |
| B3 上下文丢失率 | 长会话后关键约束被违反的次数 | 同上，约束用可机检规则表达 |
| B4 端到端 token 成本 | 完成同一任务的累计 token | 同上，报告分布不报告单值 |

**Tier B 硬性要求（缺一不发）：**

1. 模型固定并写明完整 model id（如 `claude-sonnet-5`），不写"最新模型"。
2. `temperature = 0`，且声明 temperature=0 不等于确定性。
3. **每个格子至少 5 次重复**，报告 均值 / 标准差 / min / max。单次结果一律不发。
4. 每个方案由**同一批 fixture、同一批 prompt** 驱动，prompt 模板入库。
5. 全部原始 run 日志（含失败）落 `experiments/competitive-benchmark/runs/`，随文章公开。
6. 若某方案的方差大到区间重叠，结论写「无显著差异」，**不写谁赢**。

---

## 4. Fixture 设计

不用真实私有项目，也不用玩具项目。造三档合成语料，规模跨两个数量级：

| Fixture | 规模 | 内容 | 覆盖指标 |
| --- | --- | --- | --- |
| `fx-small` | 50 条记忆 / 1 个 5 文件模块 | 单模块重构场景 | A5–A9, B1 |
| `fx-medium` | 500 条 / 80 文件 / 3 模块 | 跨模块改动 + 约束继承 | 全部 |
| `fx-large` | 5000 条 / 800 文件 | 长会话累积、检索退化 | A6–A9, B3 |

生成器：`scripts/benchmarks/competitive/generate-fixtures.mjs`，**固定 seed**（沿用现有 `--seed 17` 惯例，见 `package.json:41`）。

Fixture 必须是**合成但真实形态**的：包含真实语言的代码、真实的跨文件引用、真实的约束语句（"不要改 X 的签名"）。纯随机文本测不出检索质量。

---

## 5. 复用现有基建

现有 `scripts/benchmarks/context-lifecycle-v1*.mjs` 已经建立了一套成熟模式，直接沿用：

| 现有能力 | 文件 | 竞品基准如何复用 |
| --- | --- | --- |
| profile 化对比（baseline/s0/s1/s2） | `context-lifecycle-v1.mjs:21` | 改为 profile = 各竞品方案 |
| 差分对比 | `context-lifecycle-v1-differential.mjs` | 直接跑跨方案差分 |
| 规模化 | `context-lifecycle-v1-scale.mjs` | 对应 fx-small/medium/large |
| **证据门禁** | `context-lifecycle-v1-evidence-gate.mjs` | 关键：结论必须过门禁才能进文章 |
| JSON + Markdown 双输出 | `package.json:26` | 同样产出，md 直接进博客 |
| 诊断脱敏 | `redactDiagnostic()` | 必需，日志要公开 |

新增目录结构：

```
experiments/competitive-benchmark/
├── pinned-refs.json          # 每个对手的 commit SHA / 版本 / 抓取日期
├── env.json                  # CPU / RAM / OS / Node / Python / 容器镜像 digest
├── fixtures/                 # 生成器输出（gitignore，但 seed 入库）
├── runs/                     # 原始 run 日志，含失败
└── results/
    ├── tier-a.json           # 确定性结果
    ├── tier-b.json           # 含方差
    └── report.md             # 自动生成，直接进博客

scripts/benchmarks/competitive/
├── generate-fixtures.mjs
├── adapters/                 # 每个方案一个 adapter，统一接口
│   ├── contextdb.mjs
│   ├── mem0.mjs
│   ├── letta.mjs
│   ├── graphiti.mjs
│   └── ...
├── tier-a.mjs
├── tier-b.mjs
└── report.mjs
```

Adapter 统一接口（关键：接口必须公平，不能为自己留后门）：

```js
export const adapter = {
  name: 'mem0',
  version: '...',          // 从 pinned-refs.json 读
  async setup(workdir) {}, // 计入 A1/A2/A5
  async write(items) {},   // 计入 A6
  async retrieve(query) {},// 计入 A7，返回注入用的 context 字符串
  async teardown() {},
  capabilities: {          // A3/A4 的声明式部分，需人工核对官方文档
    requiresLLM: true,
    requiresVectorStore: true,
    requiresGraphDB: false,
    requiresCloudAccount: false,
    offlineCapable: false,
  },
};
```

`capabilities` 里的每一项都要在 `pinned-refs.json` 附上**官方文档链接 + 引用原文**。这是被质疑时唯一的挡箭牌。

---

## 6. 反驳防御（先想对手怎么打）

对比文发出去会被这样打，先堵：

| 对手会说 | 防御措施 |
| --- | --- |
| "你用的是我们旧版本" | `pinned-refs.json` 写明 SHA + 日期；发布前 48 小时内重新拉取确认无新 release |
| "你没开我们的优化配置" | 每个 adapter 的配置文件入库；**主动在文章里列出"我们采用的配置"和"官方推荐配置"的差异**；给对手预留 PR 修正入口 |
| "你的测试对你有利" | Tier A 全部是中立物理量（体积/延迟/依赖数/出站流量），不含任何本项目特有概念 |
| "LLM 测试不可复现" | 承认。Tier B 明确标注，报告方差，区间重叠即写"无显著差异" |
| "你没测我们最强的场景" | 主动写「本基准未覆盖的场景」章节，列出对手的优势场景并说明为何未测 |
| "你是竞品，有利益冲突" | 文章顶部明确声明作者身份 + 全部脚本和原始日志开源 + 明确写出本项目输的项 |

**最强的防御是主动示弱**：文章里必须有一节「哪些场景应该选对手」。这一节会让整篇的可信度和被引用率大幅上升，也是 AI 答案引擎最爱引用的内容形态。

---

## 7. 交付物

| # | 交付物 | 形式 | 用途 |
| --- | --- | --- | --- |
| 1 | `scripts/benchmarks/competitive/` | 代码 | 可复现 |
| 2 | `experiments/competitive-benchmark/results/report.md` | 自动生成 | 数据源 |
| 3 | 博客：「Agent 记忆方案怎么选：ContextDB / mem0 / Letta / Graphiti 实测」 | 长文 1800–2500 词 | 赛道 A 引流 |
| 4 | 博客：「Harness 层对比：rex-harness / Superpowers / OpenHarness」 | 长文 | 赛道 B 深度 |
| 5 | 文档页 `/benchmarks/` | 常驻页 | 承接品牌词 + 长期更新 |
| 6 | `npm run benchmark:competitive` | 命令 | 每次发版可复跑 |
| 7 | 中文版（4 语言体系已有，中文优先） | 翻译 | 中文市场（已定 40% 精力） |

第 5 项的 `/benchmarks/` 常驻页很重要：一次性文章会过期，常驻页每次发版复跑并更新 `dateModified`，是持续的 SEO/GEO 资产。

---

## 8. 排期

| 阶段 | 内容 | 工时 | 门禁 |
| --- | --- | --- | --- |
| **P1** | 定 pinned-refs + env 声明 + 逐个对手读官方 quickstart 填 `capabilities` | 1 天 | `capabilities` 每项有官方链接 |
| **P2** | Fixture 生成器 + 3 档语料 | 1 天 | 固定 seed 可重放 |
| **P3** | Adapter 层（先做 contextdb + mem0 两个，验证接口公平性） | 1.5 天 | 两个 adapter 跑通同一组 fixture |
| **P4** | Tier A 全指标 + 补齐余下 adapter | 2 天 | 结果过 evidence-gate |
| **P5** | Tier B 协议实现（5 次重复 + 方差） | 2 天 | 方差可报告，日志完整 |
| **P6** | `report.md` 生成器 + 人工复核 | 1 天 | 至少一项本项目输的结论被保留 |
| **P7** | 两篇博客 + `/benchmarks/` 页 + 中文版 | 2 天 | 含「何时该选对手」章节 |

合计约 **10.5 天**。

**分批发布建议**（用户已同意一次性或持续小发布均可）：
- P1–P4 完成即可发**第一篇**（纯 Tier A：依赖数 / 离线能力 / 出站流量 / 体积 / 延迟）。这一批数据最硬、争议最小、最快出手。
- P5–P7 完成后发第二篇（含 Tier B 质量数据）。
- 赛道 B 排在赛道 A 之后。

**如果只做最小可发版本（2 天）**：只测 A3 / A4 / A10（外部服务依赖数、离线可用性、默认出站域名），三个方案（ContextDB / mem0 / Letta）。这三个指标不需要 fixture、不需要 LLM、不需要性能环境，纯粹是「装上去、断网、抓包」，2 天能出一篇很有杀伤力的短文，且几乎无法被反驳。

---

## 9. 红线

1. **不发单次 LLM 结果。** 少于 5 次重复的数字一律不进文章。
2. **不发合成总分。** 不做加权评分、不排"第一名"。
3. **不隐藏输的项。** 报告里本项目落后的指标必须原样出现在文章里。
4. **不用 LLM 当裁判。** Tier B 的判定必须是确定性断言（测试通过 / 退出码 / 文件断言）。
5. **不测无源码的产品。**
6. **不在对手 release 前夜发布。** 发布前 48 小时确认 pinned 版本仍是最新稳定版。
7. **原始日志必须公开，含失败的 run。** 只贴成功结果等于伪造。

---

## 10. 待确认（需人工决策）

1. **Tier B 用哪个模型**：影响成本和可比性。建议 `claude-sonnet-5` 单一模型（不做跨模型矩阵，否则工作量翻 N 倍）。
2. **性能测量硬件**：本地 Windows 机 vs CI runner。CI runner 方差大但可复现性强、第三方可验证。建议 **CI runner**（牺牲绝对数值精度，换取"任何人都能复跑"）。
3. **是否在文章里点名对手**：点名流量高但对抗风险高；不点名（"方案 A/B/C"）安全但没有搜索价值。建议**点名 + 措辞中立 + 给修正入口**。
4. **赛道 B 是否包含 Superpowers**：它是本项目 5.0.0 已退役的组件（见 `docs-site/changelog.md` v5.0.0），对比自己的前身故事性强，但可能被读作自我美化。建议包含，但单独成节并说明历史关系。

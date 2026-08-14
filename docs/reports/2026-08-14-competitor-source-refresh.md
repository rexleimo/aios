# 竞品源码刷新与扬长避短建议（2026-08-14）

> 基线：`docs/reports/competitor-watchlist.json` schema v4（上次元数据 2026-07-31，上次深挖 2026-07-28）
> 本仓库：`VERSION` = 5.6.1
> 证据：GitHub REST + 本地 tarball 源码。克隆目录 `temp/competitor-repos/`（gitignored）

## 0. 本轮拉了什么

| 仓库 | 本地覆盖 | 当前版本 / HEAD | 相对 07-31 |
|---|---|---|---|
| TencentCloud/TencentDB-Agent-Memory | **全量源码** | v2.0.0（08-03）+ v2.0.1-beta.1；branch `feat/server_team` | **必须深挖**：pendingDeepDive 已兑现 |
| code-yeongyu/oh-my-openagent | **全量源码** | v5.0.0-beta.7 + 当日 memory fork 路由 | 大版本，hashline / memory-core 重写 |
| getzep/graphiti | 全量源码 | 仍标 v0.29.3；`FactResult` 补 episode 边 | 时态合同未变 |
| letta-ai/letta-code | 全量源码 | v0.30.20 | 0.27 → 0.30；citation 仍是 prototype |
| mem0ai/mem0 | 全量源码（archive） | 持续活跃；plugin 矩阵 + `mem0.md` policy | 无晋升门新证据 |
| HKUDS/OpenHarness | 全量源码（archive） | 最后 push 2026-06-04 | 继续静默，确认归档 |
| openclaw/openclaw | 元数据 + 目录树 | v2026.7.1-2；仓 2.5GB | 近 2 周几乎全是 UI/test，治理路径未触发 refresh |
| volcengine/OpenViking | 元数据（archive） | v0.4.13 | 插件打包有增量，但不覆盖 core 问题 |
| NousResearch/hermes-agent | 元数据（archive） | v2026.8.13 | 桌面/审批，不进三支柱 |

未全量拉 OpenClaw / Hermes / OpenViking：体量过大且本轮 refreshTrigger 未命中。OpenClaw 目录树已核对，`src/skills`、`src/security`、`src/context-engine` 仍在，无新治理状态机信号。

---

## 1. 结论先行（只保留会改变 AIOS 决策的）

我们不再缺“记忆库 / 规划模板 / 团队壳”。5.3–5.6 已经把 Context Lifecycle 的骨架、候选晋升、Rex 证据链、`aios work` 并发派发补上。

**本轮真正值得迭代的，只有 4 件事：**

1. **把“注入方式”做成一等公民**（学 TencentDB `InjectionMode`，不要学它的 Hub）
2. **把 ACL 做成纯函数 + 绑定校验**（学 `checkPermission` / `canBindAsset`，不要学三级 Docker 服务）
3. **把写前 stale 校验接到 Hashline 级**（学 OMO `validateLineRef`，接到已有 `ExecutionContextPacket`）
4. **不要把 ContextReceipt 做成“模型自称引用了记忆”**（Letta citation 仍是 tool_start 观测，不是成功读取）

其余要么我们已经更好，要么是明确反例。

---

## 2. 我们已领先、不要回头抄的

| 能力 | 我们 | 竞品对照 | 决策 |
|---|---|---|---|
| 压缩不烧 LLM | `search/budget.mjs` + 零 LLM Mermaid | TencentDB L1/L1.5/L2/L3 **每级调 LLM** | 保持本地确定性 |
| 退避有上限 | solo backoff cap 300s | gnhf 无 cap（已否决） | 不回头 |
| 工作流控制面 | rex Command + evidence contract | OMO / OpenClaw 都是 hook/plugin 注入主循环 | 保持 Rex 唯一推进权威 |
| 代码图 | CRG + `aios plan task --confirm-context-candidates` | TencentDB CodeGraph 只是 `@colbymchenry/codegraph` 包装 | **不要替换 CRG** |
| 记忆晋升 | session close 写 candidate sidecar，Dream 默认 DENY | mem0 Stop hook 自动 `mem0.add` | 已比他们安全 |
| 并发派发 | `aios work` 从 structured plan 拆项 + 路径所有权 | OMO TeamMode 脚本驱动 | 我们的计划驱动更可审计 |
| 需求澄清 | Ask-First + 3 轮假设清单 | 多数竞品直接开做 | 保持 |

`ExecutionContextPacket` 已经落地，但模式只有 `off | observe`（`scripts/lib/contextdb/execution-context.mjs:9`）。这是我们自己的半成品，不是竞品缺口。

`ContextCard` 全库 0 命中。07-28 方案的核心对象还没建。

---

## 3. 有价值、建议吸收（按优先级）

### P0-1  TencentDB：资产注入四档 + Agent Loadout

源码：

```34:34:temp/competitor-repos/TencentCloud__TencentDB-Agent-Memory/MemoryCore/src/metadata/types.ts
export type InjectionMode = "direct" | "summary" | "tool" | "reference";
```

绑定实体带 `injection_mode` + `priority`（同文件 `FixedAssetBindingEntity`）。默认策略：

- chat_memory → `summary`（`metadata-service.ts:1242`）
- wiki / code-graph → `reference`（同文件 `:1349`）
- skill 走匹配后注入，不是整份 SKILL.md 塞进 system

**扬长：** 我们已有 `full → summary+ref → ref-only` 的产品语言，以及字符预算截断。缺的是**按资产类型的默认档位**和**按角色/agent 的绑定表**。

**避短：** 不要做 Memory Hub / Proxy / Docker 三件套。不要做每轮 LLM 抽取。把四档接到现有 ContextDB assembler 即可。

建议落点：

- `ContextItem.injectionMode`
- 角色 / work-item loadout：哪些 memo、哪些 skill、哪些 CRG 子图用哪一档
- 超预算时按档位降级，禁止静默丢 must-preserve

### P0-2  TencentDB：权限纯函数（private 连 admin 也看不到）

```43:82:temp/competitor-repos/TencentCloud__TencentDB-Agent-Memory/MemoryCore/src/metadata/service/permission-checker.ts
// 判定顺序：资源 → owner → 成员 → visibility → 角色默认 → ACL → deny
// private = 只有 owner；团队 admin 走到这里一律 DENY
```

另外拆了两件事：

- `checkPermission`：谁能读/写/分享
- `canBindAsset`：资源能不能挂到某个 agent 上（`restricted` / `task` 直接 false）

资产状态机：`draft | candidate | approved | deprecated | archived | failed`

**扬长：** 我们已有 `project_shared / agent_private / agent_ephemeral`、candidate sidecar、`supersedeDenied`。缺的是**可见性与绑定分开**、**private 对 steward 也不穿透**。

**避短：** 不要抄 User/Team/Role 整套 SaaS 身份。本地单用户先做 3 个 scope + `restricted` 白名单即可。deny 预留但一期 allow-only。

这正好堵住 07-28 的 A0：私有 memo 不得 supersede 共享 memo。

### P0-3  OMO Hashline：按行 hash 拒绝过期写入

```67:79:temp/competitor-repos/code-yeongyu__oh-my-openagent/packages/hashline-core/src/validation.ts
export function validateLineRef(lines: string[], ref: string): void {
  // line#hash 对不上就抛 HashlineMismatchError，不允许凭旧行号改文件
}
```

OMO 把这套做成独立 `hashline-core`，编辑原语是 `replace | append | prepend`，全部带 `pos` hash。

**扬长：** 我们的 `ExecutionContextPacket` 已有 source hash 和 `required_context_stale`。缺的是**编辑时按行校验**，现在还停在 observe。

**避短：** 不要把 OMO 的 Senpi/OpenCode/Codex 三套适配器、`omo-ai` native edition、people-card/soul 人格系统搬过来。Hashline 只解决 stale write。

建议：`observe` → `enforce` 时，write preflight 要求 packet 里的 expected hash 仍匹配磁盘；不匹配就强制重读，不允许用旧行号打补丁。

### P1  OMO：后台整理按真实账单选 fork / quick

```32:46:temp/competitor-repos/code-yeongyu__oh-my-openagent/packages/omo-senpi/src/components/memory/worker/fork-cost.ts
// Fork 把父会话当 prefix；cache hit 也按「每轮都读 prefix」计费
// 他们用真实 child session 中位数，不是拍脑袋
```

他们当天还修了 `cacheHit` 硬编码 true 的夸大。

**扬长：** 我们的 dream / curator 还没上生产消费闭环。如果做 sleep-time 整理，**先算成本再选 fork 还是独立 quick 会话**。

**避短：** 不要默认 fork 父会话。fork 在长 reflection（他们测到 21 轮）上会指数变贵。

### P1  TencentDB Skill：版本乐观锁 + 内容 hash 幂等

`skill-permission.ts`：`assertOwner`（team+agent 二元组）/ `assertTeamMatch`（错 team 返回 404，防存在性侧信道）/ `assertVersionFresh`。

`skill-versioning.ts`：拷树 → 改资源 → `appendVersion`；失败 best-effort 回滚副本；content hash 相同则 no-op。

**扬长：** 我们的 workshop 已有 `previousContent` + stale hash（`skill-workshop.mjs:273-333`），这点已经对齐 OpenClaw。缺的是 **skill 内容多版本** 和 **team 错配当 404**。

**避短：** 不要上他们的 LLM SkillExtractor（每次抽取都调模型，注释写明缓存已删除）。SOP 提炼继续走 proposal + 人工 review。

### P1  mem0：项目级记忆政策文件，而不是自动写入

`integrations/mem0-plugin/skills/policy/SKILL.md`：仓库根 `mem0.md` 的 `## Instructions` / `## Agent Instructions`，SessionStart 重读，写入时当 custom_instructions。

**扬长：** 一个小的、可提交的“记住什么 / 忽略什么”契约，比再建一个记忆后端便宜。

**避短：** Stop hook 自动晋升已是反例。政策只约束 candidate 抽取，不自动进 shared canonical。

### P2  Letta：Citation 思路对，实现还不能抄

`docs/examples/mods/memory-citations.ts` 仍是 prototype：

- 观测的是 `tool_start` 参数里的记忆路径，**不是成功读取**
- shell 匹配只标 `medium`
- 模型自己调用 `memory_citation_snapshot`，可撒谎

他们自己写了：“v0 provenance is intentionally conservative and imperfect”。

**等我们有 ContextReceipt 时：** 只记录 assembler 实际注入、或 Read 工具成功返回的 hash。不要让模型自己报引用。

Letta 新增的 workspace sandbox（`workspace-sandbox.ts`：root 必须在 isolationRoot 内 + 内核 sandbox）对 AIOS 有参考，但不是三支柱 P0。

### P2  TencentDB `mem:` 会话内命令

`mem:sync` / `mem:create-skill` / `mem:help`，不离开对话。路线图还要加 Task 创建/更新。

可做成极薄的 `aios memo sync|status|pin` 提示，不要做 Proxy 拦截层。

---

## 4. 明确不要抄

| 来源 | 反例 | 原因 |
|---|---|---|
| TencentDB | Memory Hub + Proxy + 三镜像 | 远端服务化，和 local-first 冲突 |
| TencentDB | L1–L3 每级 LLM | 记忆整理比主任务还贵 |
| TencentDB | 自研/外包 CodeGraph | 我们 CRG 更深，且已进工作流检查点 |
| OMO | 关键词正则路由 / 三套 edition | 他们 ROADMAP 自己反对过早 adapter；我们入口也曾踩过 |
| OMO | people card / soul / persona 默认开 | 人格系统，不是 coding harness 核心 |
| OpenClaw | 默认免确认 apply | 07-26 已否决；我们内容扫描仍未接 workshop |
| OpenHarness | PREVIEW 纯提示词写保护 | 归档反例，06-04 后无开发 |
| mem0 | Stop 自动写长期记忆 | 未验证内容晋升 |
| Graphiti | 上图数据库 | 双时态语义我们已有 `validAt/invalidAt` |
| Hermes | 桌面 / 渠道爆炸 | 与三支柱无关 |

---

## 5. 对照 07-28 P0：哪些还没做

watchlist 里的 `p0OptimizationTargets` 仍然正确，本轮没有被竞品推翻：

| 目标 | 2026-08-14 状态 |
|---|---|
| memo：ACL / publish gate / provenance / validity | 有 candidate + supersedeDenied；**缺 visibility×bind 纯函数** |
| planning：Context Impact Set / Packet / stale preflight / reconcile | Packet 有，**模式停在 observe**；ContextCard 仍 0 |
| team：steward 共享记忆 / ContextReceipt / ACL-sticky 压缩 | Dream 默认 DENY 是对的；**Receipt 未做** |

新加、且本轮源码证明值得插队的只有一条：

- **Loadout + InjectionMode**（TencentDB v2 的真正增量，不是 Wiki/Hub）

---

## 6. Watchlist 建议

- **TencentDB pendingDeepDive 关闭。** v2.0.0 / v2.0.1-beta.1 已读完。下次只在 `InjectionMode` / ACL / result-ref 合同再变时深挖。
- **OMO 仍是 planning 核心参照**，问题收窄为：Hashline stale-write + 恢复 lineage + 后台整理成本路由。不要跟踪 omo-ai native。
- **Letta 仍 specialist**：citation 未升级到“成功读取”，不进 core。
- **Graphiti 不触发 refresh。** `source_node_uuid` 是检索字段，不是时态合同。
- **OpenClaw 不触发 refresh。** 近 2 周无 workshop/quarantine 架构变化。
- **OpenHarness 保持 archive。** 71 天无 push。

---

## 7. 建议的下一轮实现顺序

只做能接到现有模块上的，不新开子系统：

1. **ACL 纯函数** — `scripts/lib/memo/storage/` 增加 `checkMemoPermission` + `canBindToAgent`；private 不得 supersede shared。
2. **InjectionMode** — assembler 按 item 类型默认 `summary`（memo）/ `reference`（CRG/offload ref）/ `tool`（skill 按需）/ `direct`（硬约束）。
3. **Packet `enforce`** — 把 Hashline 思想接到 write preflight：expected hash 变了就 `required_context_stale`。
4. **ContextCard** — 一个 work item 一张卡（目标、验收、硬约束、工作集、假设、下一步验证命令）。这是 07-28 欠债，不是新潮。
5. **ContextReceipt** — 只记实际注入/实际读取；不要 Letta 那种模型自报。

做完 1–3，memo P0 和 planning stale preflight 就能验收。4–5 才是 Context Lifecycle 闭环。

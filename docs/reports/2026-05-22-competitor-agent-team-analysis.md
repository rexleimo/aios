# 竞品全面刷新 + Agent Team 可借鉴想法分析

> 生成日期: 2026-05-22 | 数据来源: GitHub API + 竞品文档交叉验证
> 方法: 4个并行分析Agent分别覆盖记忆系统/Harness编排/执行质量/浏览器验证

---

## 一、全量竞品元数据刷新 (vs 上次记录)

### Agent Memory 系统

| 竞品 | 上次记录 Stars | 当前 Stars | Delta | 最后推送 | 最新版本 | 活跃度 |
|------|--------------|-----------|-------|---------|---------|--------|
| TencentDB-Agent-Memory | 未记录 | 3,299 | — | 2026-05-18 | v0.3.4 | 活跃 |
| mem0 | ~52K(5月17日) | 56,240 | **+4K** | 2026-05-19 | cli-v0.2.5 | 极活跃, 310贡献者 |
| Zep | ~4.5K(5月17日) | 4,584 | ~持平 | 2026-04-09 | v3.22.0(SDK) | 主库较安静 |
| Letta | ~22K(5月17日) | 22,831 | ~持平 | 2026-05-14 | v0.16.8 | 活跃, 新增子项目 |

### Harness/编排

| 竞品 | 上次记录 Stars | 当前 Stars | Delta | 最后推送 | 最新版本 | 活跃度 |
|------|--------------|-----------|-------|---------|---------|--------|
| OpenHarness | 12,504(5月14日) | 12,823 | +319 | 2026-05-17 | v0.1.9 | 极活跃, 50贡献者 |
| gnhf | 1,705(5月14日) | 1,565 | -140* | 2026-05-07 | v0.1.41 | 中等 |
| oh-my-openagent | 57,719(5月14日) | 57,775 | +56 | 2026-05-14 | v4.1.2 | 极活跃, 220贡献者 |
| overstory | 1,295(5月14日) | 1,294 | -1 | 2026-05-09 | v0.11.0 | 中等 |
| revfactory/harness | ~3K(5月10日) | 3,363 | +363 | 2026-05-07 | v1.0.1 | 稳定增长 |
| long-running-tasks | — | 1 | — | 2026-03-06 | — | 已休眠 |

### ContextDB/记忆基础设施

| 竞品 | Stars | 最后推送 | 最新版本 | 备注 |
|------|-------|---------|---------|------|
| OpenViking | 21,184 | 2026-04-06 | **v0.3.17**(5月15日!) | 极其活跃, 120贡献者 |
| OpenClaw | 373,615 | 2026-05-21 | v2026.5.20-beta.1 | 374K★, 370贡献者 |
| OpenClaw Recall | 3 | 2026-03-21 | v1.3.2 | 已休眠 |
| Hermes Agent | 160,333 | 2026-05-21 | v2026.5.16 | 极活跃, 400贡献者 |

### 控制层/其他

| 竞品 | Stars | 最后推送 | 版本 | 备注 |
|------|-------|---------|------|------|
| superpowers | 201,097 | 2026-05-14 | v5.1.0 | 官方Claude Code市场插件 |
| golutra | 3,266 | 2026-04-07 | v0.2.4 | 1人Rust项目, 较安静 |
| the-pair | 266 | 2026-03-30 | v1.3.1 | 自动结对编程 |
| execplan-skill | ~26 | 2026-03-13 | — | 低活跃 |
| vision-test-harness | 0 | 2026-04-01 | — | 概念验证阶段 |
| RavenPair | 0 | — | — | 已休眠 |

*\*gnhf delta负值可能是GitHub API统计波动, 上次数据来自star-history第三方*

### 关键新信号 (5月10日~5月22日)

1. **OpenHarness dry-run功能已进入unreleased分支** — ready/warning/blocked裁定引擎, 之前列为AIOS P0需求
2. **OpenViking v0.3.17 (5月15日)** — 新增LangChain/LangGraph适配器, OVPack v2, 审计控制台, VLM故障切换
3. **oh-my-openagent v4.1.2 (5月14日)** — 持续增强学科Agent路由和IntentGate
4. **mem0 增长至56K★** — 8天增加4K星, CLI工具发布, 生态加速
5. **OpenClaw 374K★ + 超活跃** — v2026.5.20-beta.1, 未来AIOS参考重点

---

## 二、Agent Team 可借鉴想法精选

### P0 — 立即实施

| # | 想法 | 来源 | 描述 | AIOS映射 |
|---|------|------|------|---------|
| 1 | **Dry-Run Readiness 裁定** | OpenHarness | 执行前输出ready/warning/blocked裁定, blocked时给出修复建议 | `harness run` 预检层 + watchdog |
| 2 | **VLM/Provider 故障切换** | OpenViking v0.3.17 | 主provider遇到rate limit/5xx时自动切换到backup | `model-router` skill增加链式备份 |
| 3 | **Auto-Compaction 自动压缩** | OpenHarness | token超阈值自动后台压缩, 保留决策点丢弃冗余 | ContextDB `context:pack` 自动化 |
| 4 | **Worktree + Resume Notes** | gnhf | 每个迭代独立worktree, resume notes秒级恢复 | `using-git-worktrees` + `harness resume` |
| 5 | **语义金字塔分层压缩** | TencentDB | L0→L3渐进披露, 61% token节省 | 对齐aios-compress三级到语义层次 |
| 6 | **零LLM检索管道** | mem0 | 写入一次LLM提取, 检索纯向量/关键词 | ContextDB读路径去LLM依赖 |
| 7 | **Mentoring质量门控** | the-pair | 只读Mentor Agent审查执行结果, 生成verdict | harness checkpoint后自动审查 |
| 8 | **可复用工作流模板** | golutra | 模板系统编排Skill为多步流水线 | `.aios/templates/` + `aios template apply` |

### P1 — 近期规划

| # | 想法 | 来源 | 描述 | AIOS映射 |
|---|------|------|------|---------|
| 9 | **自我改进闭环(技能自动生成)** | Hermes / superpowers | 成功执行后自动总结为Skill | Harness checkpoint后 `skillify` 步骤 |
| 10 | **Per-Agent模型路由** | oh-my-openagent / OpenViking | 团队中每个Agent独立指定模型 | `aios team` 支持 per-agent model 配置 |
| 11 | **多点信号融合检索** | mem0 | 语义+BM25+实体三通道融合 | ContextDB增加FTS5+实体索引 |
| 12 | **四时间戳事实失效** | Zep | 事实标记valid_until/expired_at, 自动降权过时信息 | memo系统增加时间衰减 |
| 13 | **ExecPlan结构化追踪** | execplan-skill | Planner/Generator/Evaluator分离, 四类日志 | 对齐AGENTS.md日志规范, harness内置 |
| 14 | **YAML浏览器验证流** | vision-test-harness | YAML定义端到端浏览器测试 | harness + Browser MCP集成 |
| 15 | **截图隐私覆盖层** | vision-test-harness | 自动模糊敏感区域 | Privacy Guard扩展到screenshot输出 |
| 16 | **SQLite Mail Bus多Agent通信** | overstory | 持久化消息队列Agent间通信 | ContextDB增加message store |
| 17 | **元技能+6种团队架构** | revfactory/harness | Pipeline/Fan-out/Expert Pool等可复用模式 | `orchestrator-blueprints.json` 扩展 |

### P2 — 中长期

| # | 想法 | 来源 | 描述 | AIOS映射 |
|---|------|------|------|---------|
| 18 | **Agent状态序列化(.af格式)** | Letta | 打包agent完整状态为自包含文件 | ContextDB导出/迁移 |
| 19 | **审计控制台BFF** | OpenViking v0.3.17 | token用量/检索热力图/请求审计 | 复用observability event bus |
| 20 | **思考者-记忆者配对架构** | RavenPair | 专用Planner + Memory Agent角色分化 | Team角色扩展 |
| 21 | **斜杠命令调用技能** | OpenHarness | /skill-name精确触发技能 | 技能系统交互增强 |

---

## 三、关键结论

### 最重要发现: OpenHarness dry-run readiness
OpenHarness unreleased分支已实现 `oh --dry-run` 输出 `ready/warning/blocked` 裁定 — 这正是AIOS 4月roadmap记录的P0需求。**建议立即diff OpenHarness的readiness实现, 加速AIOS版本落地。**

### 差异化窗口
目前没有竞品同时具备: **dry-run readiness + auto-compaction + 意图路由 + 零LLM检索**。如果AIOS能在Q3同时拿下P0的8个想法, 将在Agent Harness领域建立显著领先。

### 竞品生态判断
- **OpenHarness** — 路线最接近, 建议建立定期diff-review机制
- **OpenViking** — v0.3.17功能爆发(LangChain/审计/故障切换), 字节跳动背书, 值得深度跟踪
- **mem0** — 用户增长最快(56K★), 单次LLM提取+零LLM检索理念最值得借鉴
- **gnhf** — 极简高效, 最适合作为"极简long-running"参考源
- **Hermes/superpowers** — 顶级项目在验证"自我进化+技能生成"方向, AIOS应朝这个方向演进

### 建议执行顺序
```
Phase 1 (本周):     Readiness裁定 + 故障切换 + Resume Notes
Phase 2 (本月):     Auto-Compaction + 语义金字塔 + 零LLM检索 + Mentor门控
Phase 3 (下月):     技能生成 + 混合检索 + 工作流模板 + 浏览器验证
Phase 4 (Q3):       事实失效 + Mail Bus + 审计控制台 + Agent状态序列化
```

---

*数据来源: GitHub API, star-history.com, 各项目README/CHANGELOG*
*分析方法: 4路并行深度分析Agent + 人工汇总*

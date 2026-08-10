# 竞品全量扫描 — 执行计划

> 生成日期: 2026-06-04
> 方法: 5 路并行 deep-dive (aios team) + 单主报告产出
> 触发: 用户要求"拉取所有竞品并分析参考价值功能"

## 目标

拉取 `competitor-watchlist.json` 内的全部 **19 个竞品**（5 大类），刷新元数据并完成一次端到端 deep-dive，输出对 **AIOS / AIOS** 有参考价值的功能清单（P0/P1/P2）。

## 竞品范围

5 类别 / 19 项，详见 `docs/reports/competitor-watchlist.json`：

| 类别 | 数量 |
|------|------|
| memory-systems | 4 (mem0, Letta, TencentDB, Zep) |
| harness-orchestration | 6 (OpenHarness, oh-my-openagent, gnhf, overstory, revfactory, long-running-tasks) |
| context-infrastructure | 3 (OpenViking, OpenClaw, OpenClaw Recall) |
| execution-quality | 4 (Hermes, superpowers, the-pair, execplan-skill) |
| browser-control-plane | 2 (vision-test-harness, golutra) |

## 阶段

### Phase 0 — 元数据拉取（~3 min，串行）
- 读 `competitor-watchlist.json`
- 调 GitHub `/repos/{owner}/{repo}` 拉 stars / forks / pushed_at / latest release
- 输出内存 diff + 标记回写字段

### Phase 1 — 5 路并行 Deep-Dive
- A. memory-systems
- B. harness-orchestration
- C. context-infrastructure
- D. execution-quality
- E. browser-control-plane

每路产物：竞品现状卡 + 参考价值功能清单（每项含 5 字段：来源 / 实现细节 / AIOS 映射 / 可移植性 / 优先级）

### Phase 2 — 交叉分析（~15 min，串行）
- 跨 5 路去重归并 → 6–10 个高价值"功能簇"
- 映射到 AIOS 模块（ContextDB / harness / model-router / privacy / browser MCP / 技能系统）

### Phase 3 — 产出
- `docs/reports/2026-06-04-competitor-agent-team-analysis.md`（主报告）
- `docs/plans/2026-06-04-competitor-refresh-plan.md`（本计划）
- `docs/reports/competitor-watchlist.json`（元数据 + crossCuttingTrends 回写）

## 验证标准

- 19/19 竞品覆盖（每条都有最新元数据）
- ≥ 6 条"对 AIOS 有利的参考价值功能"（P0 ≥ 2、P1 ≥ 4）
- 每条建议含 5 字段
- 与 5月22日报告对比：识别新增 / 回退 / 误判

## 用户决策

| 维度 | 选定 |
|------|------|
| 扫描深度 | 全 deep-dive |
| 产出结构 | 单主分析报告 |
| 执行方式 | aios team 5 路并行 |
| watchlist | 回写 + append crossCuttingTrends |

# Memo Backlog 全量收尾 — 测试范围契约（rex-test-design / memo-all-impl）

- **目标**：把 `docs/plans/2026-09-08-memo-optimization-backlog.md` 里剩余待办全部落地：
  B3、C1 C2 C3 C4、D1 D2 D4 D5 D6、E1 E2 E3、F1 F2 F3、G1 G2、A4。
- **非目标**：不动已完成项（A1 A2 A3 B1 B2 D3）的排名字典与语义；
  不引入外部网络依赖；不碰生产数据；V1 enforcement 整体 GO 判定仍随大盘走，
  本工单只交付属 memo 的硬门切片。
- **范围内行为**：写入 guard、治理权威/ACL/扫描门、读取证据、GC 锁、
  pinned 限额、渐进披露、预算降级、offload+Mermaid、卫生命令+保留策略、
  Autodream 自动触发、全客户端投影、导入器、memory report、真实评测集、
  本地 embedding 粗排（默认关）。
- **范围外行为**：Console UI、MCP 真实连接、AG-UI 完整流（属 aios-pro 大盘）。
- **允许的测试缝**（稳定公共入口优先）：
  - `node --test scripts/tests/memo-*.test.mjs`（单元/集成主缝）
  - `aios memo <add|list|search|pin|candidates|storage|hygiene|report|import>` CLI 冒烟
  - `scripts/lib/memo/eval/recall-ab.mjs` 四臂（A4 落地后五臂）top-1 不降
  - `run-test-suite.mjs regression` 全量回归（里程碑门）
- **完成判据**：每批 focused 测试绿 + AB 臂零漂移 + `git diff` 无越界；
  最终全量回归 0 fail + backlog 状态全标已完成+证据。

## 验收映射（行为 → 可观察断言）

| # | 验收行为 | 断言位置 |
| --- | --- | --- |
| B3 | 并发写后写者被拒并要求 re-read | 新 `memo-pinned-guard.test.mjs`：stale hash 写被拒码 + 重读后写成功 |
| D2 | env 给不了治理权威 | 新 `memo-authority-env.test.mjs`：毒化 `AIOS_RUNTIME_*` 下 authority 不变 + 源码无 `AIOS_RUNTIME` 引用断言 |
| D5 | 未授权 agent 不能 supersede 他人 space 事件 | `memo-temporal` 追加：跨 space 写时 denied；dangling 写时 denied（`unknown_target`） |
| D6 | promote 路径强制过 scan | `memo-candidate-governance` 追加：注入样本 promote 被拒码 `unsafe_content` + receipt 记 safety 结论 |
| D1 | receipt 记录受控读取实际读取事件 | search/recall 返回 receipt（含命中 eventId + 读者身份 + 时间） |
| D4 | 并发 append+GC 不丢事件 | 并发 fixture：GC 与 append 同锁域后事件数守恒 |
| C3 | pinned block 上限+行号渲染+余量元数据 | `pinned.mjs` limit 行为测试 |
| C4 | search 摘要→timeline→详情分层 | `context:pack` 层级参数测试 |
| C1 | 超预算降级且 must-preserve 可达 | planned 执行 packet 降级测试 |
| C2 | 长任务 context 压缩率可测且可回溯 | offload+Mermaid 落地测试 |
| E2/E3 | `--dry-run` + 可审计 diff；归档/轮替+大小可观测 | hygiene 命令测试 |
| E1 | 默认 opt-in 自动触发走既有治理 CLI | 触发器测试 |
| F2 | 7 客户端 doctor 全绿+注入冒烟 | 投影测试 |
| F3 | 各格式 fixture 进 candidate 可审核晋升 | 导入器测试 |
| F1 | 缺项清单化逐项验收 | 核实报告（先核实再定码量） |
| G2 | `aios memory report` 输出+--json | 命令测试 |
| G1 | 真实语料评测集 + 同 runner 纪律 | 评测集脚本+基线数 |
| A4 | 开关默认关；开后多一 embedding arm；零外部依赖 | `recall-ab` embedding 臂 + top-1 不降 |

## 最小纵向切片（首批）

B3 pinned stale-write guard：读-改-写竞争是 pinned 路径真实存在的洞
（`writePinnedMemo`/`appendPinnedMemo` 裸覆盖），改动面限 `pinned.mjs` +
同目录单测 + CLI 透传不断言回归。它代表本工单的典型形状：
小边界、纯函数优先、失败码可断言、旧行为默认不变。

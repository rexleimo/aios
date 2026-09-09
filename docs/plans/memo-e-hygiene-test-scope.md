# E2+E3 — memo hygiene 命令 + l2-events 保留策略(测试范围契约)

- **目标**:
  E2——`memo hygiene` 卫生命令落地 survey 报告的审批队列四步:
  ① 陈旧 session 识别、② pinned 复核(复用 C3 `renderPinnedBlock`)、
  ③ 按源类列整理提案、④ 显式批准后执行(dry-run 默认 + 可审计 diff)。
  E3——`l2-events.jsonl` 保留策略:keep-newest 轮替(旧行进 archive 追加文件,
  零丢失: moved + kept == before)+ 大小可观测(bytes/lines/oldest)。
- **非目标**:不删任何数据(只 archive/rotate,无 delete);不动 memo storage
  的 `events.jsonl`(它是 recall 主存储,轮替会隐藏 active 事实);不动 pinned
  内容本身(redact 归 owner 走既有 `pin set`);不引入 l2 写锁(记录 owner 空闲期运行约束)。
- **安全规则**:space 级活 session(`workspace-memory--` 前缀,per-space 基础
  设施,legacy pinned 回退依赖)永不判过期、永不归档;meta 缺失/不可读的
  session 状态记 `unknown`,只列出、永不归档(fail-safe);过期 = 非前缀
  session 且 status=running 且 updatedAt 距今 ≥ minAgeDays(默认 7)。
- **测试缝**:新 `memo-hygiene.test.mjs`(survey 只读零突变、过期判定、
  archive 移动可逆、rotate 零丢失、无 action flag 拒绝执行、--json 可解析);
  邻近 pin/cli-integration 全文件。
- **完成判据**:新测试绿 + 邻近回归绿;真实仓库 survey 冒烟(1.46MB l2
  可观测、坏名 session 列出);apply 不对真实工作区运行(owner 审批是
  survey L24-29 的一至三步,属人)。
- **diff 限**:新 `scripts/lib/memo/hygiene.mjs`、新
  `scripts/lib/memo/cli/commands/hygiene.mjs`、`run.mjs`(dispatch)、
  help/SKILL.md 文档同步。

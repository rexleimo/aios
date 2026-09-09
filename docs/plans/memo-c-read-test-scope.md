# C3+C4 收尾 — 测试范围契约（rex-test-design / memo-C-read）

- **目标**：
  C3——`pinned.mjs` 暴露限额 API：`renderPinnedBlock`（行号化渲染 +
  chars/limit/remaining/truncated 余量元数据）+ `memo pin status`；
  超限整理走既有 `assertMaxChars` 拒绝语义。
  C4——`memo search --level summary|full`（summary 截断 400 字≈100 token）
  + pack 大小 footer（entries/chars/level）；timeline 层由既有 `memo list`
  承担，detail 层由既有 full 行 + recall 承担。
- **非目标**：不动 `pin show` 默认输出（现有断言依赖原文）；
  不动 recall 预算语义；不造新的 timeline 命令。
- **测试缝**：新 `memo-pinned-render.test.mjs`（C3 纯函数）；
  `memo search --level/--json` CLI 冒烟（C4）；邻近 pin/cli-integration 全文件。
- **完成判据**：新测试绿 + 邻近回归绿 + AB 三臂零漂移；
  diff 限 `pinned.mjs`、`pin.mjs`、`events.mjs`（search）、`rendering.mjs`。

## 验收映射

| # | 验收行为 | 断言 |
| --- | --- | --- |
| C3 | per-block limit + 行号渲染 + 余量元数据 | render 行号连续、超限 truncated、remaining=limit-chars；`pin status` 打印三元组 |
| C4 | 分层读 + pack 可观测 | summary 行长度≤400 且带 footer `pack: N entries, M chars, level=summary`；full 行为不变 |

## 最小纵向切片

C3 纯函数先行：无 IO、今天缺失，是诚实 RED。

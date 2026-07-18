# rex-harness 剩余 Skills 一次性训练与验收计划

## 目标与范围

本计划收口尚未接受的内置软件工程 Skills：`rex-requirements`、`rex-design`、`rex-planning`、`rex-test-design`、`rex-strict-tdd`、`rex-minimal-construction`、`rex-implement`、`rex-debug`、`rex-code-review` 与 `rex-wayfinder`。

`rex-workflow` 和 `rex-tdd` 已有独立接受证据，不重新训练。每个 Skill 独立拥有任务、Target、Scorer、留出集与报告；不得复用其他 Skill 的回答、评分或留出题。

## 固定训练协议

每个 Skill 必须依次执行以下阶段，阶段产物都落在 `.skillopt/rex-<skill>-2026-07-17/`：

1. **冻结基线**：将正式 `SKILL.md` 复制为 `skill_v0000.md`，记录 SHA-256；训练期间正式版本只读。
2. **构造题集**：10 个训练题与 5 个独立留出题，每题至少三条可判定断言。候选编辑者只能读取训练题，绝不能读取留出题。
3. **隔离执行**：control（无 Skill）、baseline（v0000）和 candidate（候选）分别以无会话历史的 Target 运行；固化原始回答与输入哈希。
4. **独立评分**：每组由不读取任何 Skill 的 Scorer 按题逐断言评分。通过项必须引用 Target 原文中的连续非空片段；失败项引用必须为空。题目只有全部断言通过才记为 `hard=1`。
5. **有效性检查**：在讨论候选优劣前，先确认留出集有区分度：baseline 与 control 不得同时满分；若两者都满分，标记 `invalid_hard_score_saturation_consumed`，消耗该留出集并重新从零设计，不得接受候选。
6. **候选编辑**：只根据训练集失败模式生成通用规则，最多四项互不重叠的编辑；禁止题目答案、专名或断言措辞进入候选文本。
7. **四条 Gate**：
   - `candidate.validationHard > baseline.validationHard`
   - `candidate.trainHard >= baseline.trainHard`
   - `candidate.validationHard >= control.validationHard`
   - `candidate.trainHard >= control.trainHard`

   任一失败均拒绝，保留正式 Skill 不变，并写明失败原因。只有四条都通过才将候选复制到 `best_skill.md` 与正式 `SKILL.md`。
8. **复审与回归**：对通过的候选运行证据测试、`npm run test:rex-integration`、`git diff --check`，并由新上下文 Reviewer 检查 `Critical=0`、`Important=0`。顶层 AIOS 命令因缺少 `yaml` 不能启动时，记录为环境阻断，不能伪称通过。

## 防止无效训练

- 留出题必须在候选冻结后由隔离设计者创建；出现饱和、泄漏、无法核对引用或 Scorer 协议违例时，整套留出题作废。
- `hard` 是唯一接受分数；`soft` 只用于定位问题，不能突破严格 Gate。
- 相同分数不是成功。候选没有严格超过 baseline 必须拒绝。
- 不允许通过增加套话、重复标题或伪造引用提高分数；Scorer 把这类回答判为失败。
- 每个 Skill 最多消耗三套独立留出集；第三套仍不具区分度时，停止接受并报告“当前 Skill 无可证明增益”，而不是硬改正式版本。

## 自主执行契约

用户已授权本训练目标持续执行。训练器不得把以下常规动作作为问题抛回给用户：选择下一轮训练、设计或作废无效留出集、运行对照/评分/Gate、拒绝候选、创建报告、执行已列验证命令，或在既定顺序中切换到下一 Skill。

遇到证据不足时，训练器应使用最小、可逆且可审计的仓库内假设，写入训练工件后继续；如果该 Skill 无法在当前证据下安全推进，就把该 Skill 标为 `blocked-by-evidence` 并训练下一个独立 Skill。只有缺少新的外部权限、会发生不可逆的数据损失，或必须由产品所有者作出不可从仓库推导的取舍时，才允许中断并询问用户。

## 执行波次

为避免前一阶段的语义尚未稳定就放大到后续阶段，按以下顺序收口：

1. `rex-requirements` -> `rex-design` -> `rex-planning`
2. `rex-test-design` -> `rex-strict-tdd` -> `rex-minimal-construction`
3. `rex-implement` -> `rex-debug` -> `rex-code-review` -> `rex-wayfinder`

同一波次只并行无共享写入的题集设计或只读 Target；候选编辑、Gate、正式 Skill 同步和复审必须串行。每完成一个 Skill 都更新验收矩阵，再开始下一个。

## 完成定义

全部十个目标都必须有：冻结基线、独立题集、三组 Target 原始回答、三组 Scorer 结果、Gate、状态文件、中文报告、训练证据测试及复审结论。若某个 Skill 经过三套有效留出集仍无可证明提升，它应保留基线并在矩阵中明确标注 `no-proven-improvement`，不能被误标为已训练通过。

# Console 原型 Standards / Spec 审查

审查固定点：`08fc6a6ebfaf25953080b9bd3bbd1dd8e82c20f4`（本工作开始时 main/HEAD）。范围是该固定点上的未提交工作树增量；原型全新文件必须作为新增内容审查，不能用空的 HEAD...HEAD 代替。共享 shell 只纳入本轮“新版交互预览”链接；同一文件内既有 MCP 图标扩展不归本轮。

非空差异：`.aios/planning/console-product-prototype-review.diff`。冻结清单：`.aios/planning/console-product-prototype-review-snapshot.json`，包含 11 个原型文件的字节哈希和行数。因用户已授权本地未提交原型，本次采用实际工作树与已知任务起点，而非新增一次 fixed-point 询问或创建提交。

规格：`docs/plans/2026-11-06-console-product-direction.md`，以及当前计划“原型测试范围”。该范围明确示例数据、可点击流程、无真实写入；后端闭环属后续工作。

## Standards

检查了 11 个原型文件和共享 shell 的入口增量。文件按框架、数据、记忆、MCP、流程分工；新文件 <400 行，目录 ≤8 项，命名 kebab-case；无新增依赖。状态只存 React；无生产写 API。typecheck、build、Shell 94/94 与全量回归 2745/0/12 已取得证据；标准检查原型无新增违规，仓库已有 fileLines 6 与 duplicateLines 631 单独保留。

Smell 全部 12 项：Mysterious Name 未见；Duplicated Code 未见；Feature Envy 未见；Data Clumps 未见；Primitive Obsession 未见；Repeated Switches 未见；Shotgun Surgery 未见；Divergent Change 未见；Speculative Generality 未见；Message Chains 未见；Middle Man 未见；Refused Bequest 未见。UI 共用 Field、Modal、Panel 和状态表，未抽取不必要的业务框架。

结论：当前范围无未解决 hard/judgement finding。

## Spec

已对照原型验收：导航可达，首页指定工具详情与指定项目记忆可达；浏览记忆无需关键词；项目 ID 与记忆 ID 组合用于选择及操作；私人项目、同 ID、同名不同路径、来源缺失、原文、新旧关系、空项目、不可达恢复都有受控示例。MCP 的工具/项目范围、独立参数、预览、写入与测试结果、失败重试、冲突和输入保留分别可观察。明确标注原型，未把模拟结果作为真实连接证据。

走查发现并已修复：`prototype-ui.tsx` 受控 Dialog 缺少焦点回跳；`memory-workspace.tsx` 新记忆 UTC 与本地 fixture 格式混用。前者已以 Escape/焦点断言复测；后者已统一成本地时间，更新/同名项目/隔离场景复测通过。未接入私人数据、注册或真实配置，属于已声明非目标。

结论：静态规格审查无未解决 finding；浏览器补充结果以验证记录为准。

Standards：0 个未解决 finding；Spec：0 个未解决 finding。结论仅覆盖交互原型，不覆盖真实后端交付。

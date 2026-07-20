---
name: rex-tdd
description: Use only after rex-harness selects scope-bound baseline TDD and supplies the current Command.
---

# Rex TDD

仅在 rex-harness 已经确认测试范围契约、激活基础 TDD Capability，并提供当前 Command 后执行本流程。测试范围契约是本周期的行为边界，不得由实现、工期或当前测试结果反向改写，也不得在 TDD 阶段自行扩大或缩小测试范围。目标或非目标需要变化时，向 rex-harness 报告测试范围变更需求并停止；只有收到新的 `rex-test-design` Command 后，才能重新确认用户目标与契约。

## 执行不变量

1. 一次只执行当前 Command 的一个阶段；RED 不提前执行 GREEN 或 REFACTOR，任何阶段都不调用下一个 Provider。
2. 测试必须通过稳定公共入口约束测试范围契约中的用户可观察行为。Mock、私有 helper、内部调用次数和实现类型可以辅助搭建测试，但不能替代行为断言。
3. `rex-tdd` 只处理普通范围内行为。模型不得自行升级或切换到 `rex-strict-tdd`；当输入只是提出升级请求、却没有 rex-harness 选中的严格 TDD Command 时，必须同时取得回归或高风险边界 Fact 与新的严格 TDD Command，任一缺失都停止并报告未获授权。若当前 Command 已明确选择 `rex-strict-tdd`，该 Command 就是 rex-harness 已完成激活决策的授权投影；即使投影没有重复内部风险 Fact，也应按当前阶段执行，不得重新裁决激活或仅因此把合法阶段判为 `blocked/incomplete`。首次严格 RED 依据当前严格 Command、测试范围契约和本轮行为级 RED 证据完成；后续 GREEN、REFACTOR 或 Evidence 还必须核对紧邻前序阶段已接受的行为级证据，不得跳过前序证据直接推进。

## 冻结观察包

当输入要求只解释冻结观察并禁止现场运行时，不执行或建议重跑其中的命令，也不把冻结记录改写成自己的执行结果。先明确当前 mode/stage 是 rex-harness 已选定并下发的 Command；不重新激活、重路由、升级或降级，也不要求便携投影重复宿主内部 Fact。随后逐项复述每条与契约有关的精确命令、退出状态和关键输出，区分用户可观察行为结果、基础设施失败与内部辅助证据；再逐项判断 Evidence Contract 是否满足，返回当前阶段的 `complete`、`blocked` 或 `incomplete`。不得省略会改变判定的观察维度，也不得用概括性结论替代公共输入、预期、实际结果、退出状态或失败分类。最后停止在当前阶段；只有新的 rex Command 才能授权后续阶段或修复工作。

## RED

1. 从验收映射中选择当前最小行为，只新增或启用能够观察该行为的测试。
2. 运行精确、可复现的聚焦测试命令，记录退出状态和观察到的失败输出，确认失败原因与缺失目标行为一致。
3. 测试因语法、环境、错误夹具或无关依赖失败时，不得记为合法 RED；先修复测试基础设施并重新运行。
4. 测试在产品变更前已经通过，或只证明 Mock/helper 被调用时，也不构成合法 RED。

## GREEN

1. 编写使当前行为通过的最小完整实现，不提前加入后续能力。
2. 运行目标测试并记录精确命令、退出状态和通过输出；在合理成本内运行受影响的邻近测试。
3. 不得通过删除测试、跳过测试、弱化断言、扩大容差或把期望值改成当前错误输出来获得 GREEN。
4. 只验证 Mock、helper 或实现细节的绿色测试不能代替测试范围契约要求的用户行为证据。

## REFACTOR

1. 在测试保持通过的前提下整理重复、命名和边界；没有明确收益时保留简单实现。
2. 审查测试差异，确认它仍约束测试范围契约中的用户可观察行为，而不是实现细节。

## Evidence

按当前阶段返回真实、可核验的引用。测试 Evidence 必须分别记录与契约相关的输入或前置条件、契约预期的用户可观察结果、实际观察到的用户可观察结果、精确测试命令、退出状态和关键失败或通过输出；聊天结论、`TODO`、文件存在或未运行的测试都不是证据。RED 为 `failing-test-observed`、`red-failure-reason-recorded`；GREEN 为 `passing-test-observed`、`implementation-diff-recorded`；REFACTOR 为 `refactor-check-recorded`、`test-diff-review-recorded`。

凡当前 Command 或 Evidence Contract 要求执行命令，都必须实际运行该命令。若无法执行，明确报告当前阶段 `blocked` 或 `incomplete`，并分别记录已尝试的精确命令、具体错误和可执行的解阻条件；不得用静态推断、手工截图、未执行引用、其他测试结果或前序阶段日志替代本阶段要求的执行结果。可以保留已经取得的部分证据，但必须标注为 partial，且不得据此推进 Command。

宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。证据不足时停在当前 Command，不伪造引用，也不要调用下一个 Provider。

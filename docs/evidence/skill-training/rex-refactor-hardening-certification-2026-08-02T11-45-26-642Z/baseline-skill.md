---
name: rex-refactor-hardening
description: Use only after rex-harness selects behavior-preserving hardening and supplies the current Command.
---

# Rex Refactor Hardening

仅在 rex-harness 已经根据 `behavior-preserving-hardening` 决定激活本 Capability，
并提供当前 Command 后执行。此路径用于没有诚实 RED 的安全加固、重构或私有边界收紧；
不得把已经通过的测试、Mock 调用或静态推断伪装为 `failing-test-observed`。

## Baseline

1. 使用稳定的公共入口，在独立、可清理的真实场景环境中运行基线。
2. 环境必须包含与任务相同类型的真实 I/O，例如实际 CLI、临时 home、符号链接、文件账本或网络边界；不直接调用私有 helper 代替场景。
3. 使用 `rex-harness receipt --root <project-root> -- <scenario-command>` 记录精确命令、前置状态、预期、实际结果和执行回执。`baseline-scenario-observed` 必须引用真实零退出的 `receipt:<id>`；基线失败、环境失败或未执行都必须停在当前阶段，不能继续修改。

## Harden

1. 只做实现目标所需的最小加固；复用现有抽象，保持封装和目录归属，不新增 test-only 产品出口。
2. 运行受影响边界的真实场景，确认公开行为保持不变且不安全路径不能绕过新校验。`affected-boundary-scenario-observed` 必须引用真实零退出的 `receipt:<id>`。
3. 不得通过放宽断言、删除用例、跳过测试或仅验证 mock/helper 来获得通过。

## Verify Invariants

1. 审查 diff，确认副作用操作只能在所需校验完成后发生。
2. 审查测试 diff，确认没有弱化用户可观察约束，也没有把内部实现细节作为唯一证明。
3. 返回当前阶段真实、可核验的 Evidence 引用；命令型 Evidence 必须引用宿主或 Rex 记录的执行回执。自然语言、`command:`、旧日志或未执行命令都不是回执。

宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封，并为每项提交真实引用。当证据不足、场景无法真实执行，或发现任务实际包含新用户可观察行为时，停止并报告当前 Command `blocked`；不要自行切换到 TDD，也不要伪造 RED 或调用下一个 Provider。

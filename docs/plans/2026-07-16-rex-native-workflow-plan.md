# rex-harness 原生工作流完善计划

## 目标

将 `rex-harness` 完善为可以脱离 `harness-cli / AIOS` 独立工作的软件工程控制面。默认执行路径只使用 rex 自有 Capability、Provider、Skill、Reviewer 和 Evidence Contract；外部 Matt、Ponytail、Superpowers、ECC 只保留为显式兼容适配器，不参与默认解析。

## Search-first 决策

- **Extend**：复用现有 Fact、Activation、Command、Evidence 和 standalone store，不重写已经通过测试的工作流内核。
- **Build**：实现 rex-native Provider Catalog、Test Scope Contract、Provider Doctor、客户端投影和 MCP 接口，因为当前仓库只有外部 Provider 名称，没有独立执行闭环。
- **Compose**：AIOS 继续通过公共 API 消费 rex，并仅提供进程调度、安全、ContextDB、Team 和长任务恢复等宿主增强。

## Test Scope Contract

### 用户目标

1. `rex-harness` 默认能力可以独立替代当前工作流中的 Matt、Ponytail、Superpowers 和 ECC 职责。
2. 所有可观察行为变更都必须先确认测试范围，再进入 TDD；风险只提高测试深度，不能决定是否需要 TDD。
3. 测试必须证明用户要求的行为，不能通过恒真断言、Mock 自证、弱化断言或实现细节复制伪造质量证据。
4. 只安装 `rex-harness` 的 Coding Agent 可以通过 `rex-workflow` + CLI 完成完整工作流；嵌入式宿主使用 JS API，核心包不内置 MCP。

### 非目标

- 不复制或 vendoring 外部参考仓库的完整实现。
- 不在 rex 内实现模型进程、Team、ContextDB、RTK、隐私代理或长任务 Harness。
- 不根据提示词长度预判 `Fast | Balanced | Deep`；执行画像仍由实际 Activation 事后计算。
- 不修改生成文件 `mcp-server/dist/index.js`。

### 可观察验收行为与测试映射

| 验收行为 | 公共测试缝 | 最小失败断言 |
| --- | --- | --- |
| 默认 Capability Pack 不再暴露外部项目 Provider ID | `createRexCapabilityPack()` | 任一默认 Provider ID 含 `matt`、`superpowers`、`ecc` 或 `ponytail` 时失败 |
| 普通行为变更先确认测试范围，再执行 TDD | `startSoftwareWorkflow()` / `advanceSoftwareWorkflow()` | Test Scope Evidence 未齐全时不能进入 RED；齐全后下一 Capability 必须是 TDD |
| RED 证据必须说明目标测试和预期失败原因 | `validateCommandEvidence()` | 只有命令引用、没有范围映射或失败原因时拒绝 |
| Provider Doctor 验证真实内置入口 | `runDoctor()` | Provider 缺少内置说明文件或启用 Capability 无绑定时状态不是 `ready` |
| 客户端投影安装 rex 自有 Skill | `rex-harness init --client <client>` | 临时目录中缺少目标客户端 Skill 文件时失败 |
| MCP 与 CLI 共用同一应用服务 | MCP tool handler | MCP 的 start/status/evidence/resume 结果与公共 API 契约不一致时失败 |
| AIOS 默认保留 rex-native Provider | `rex-harness-adapter.mjs` | 未显式配置兼容模式时，Provider ID 被覆盖为外部项目名称即失败 |

### 测试边界

- 以 Capability Pack、Workflow Runtime、Standalone CLI、Provider Doctor、Client Init、MCP Handler 和 AIOS Adapter 为公共边界。
- 优先使用真实临时目录和真实状态文件；只有外部进程、模型和网络边界允许 Mock。
- 不直接测试 Capability 内部私有辅助函数，避免把目录布局和实现细节固化成契约。
- 每个 RED 必须因为目标行为尚未实现而失败，不能接受语法、导入、缺依赖或测试环境错误。

### 禁止捷径

- `expect(true).toBe(true)`、只检查非空、只验证 Mock 已调用。
- 将生产实现算法复制到测试中计算 expected value。
- 为通过测试删除断言、添加 skip、扩大容差或无解释更新 Snapshot。
- 先实现再补一个永远通过的测试并声称完成 RED/GREEN。

## 实施顺序

1. 先补契约和场景失败测试，锁定 rex-native Provider 与 Test Scope Contract。
2. 修改 Fact/Capability 转换，使普通行为变更执行 `test-design -> baseline-tdd -> review`；高风险或回归再升级为 `strict-tdd -> specialist-review`。
3. 合并 Provider 小文件为 rex-native Catalog，并提供内置 Skill/Reviewer 入口。
4. 增加 Provider Doctor、客户端投影和 MCP Adapter。
5. 调整 AIOS Adapter，只允许显式兼容配置覆盖 rex Provider。
6. 同步中文文档、Skill eval、版本和变更日志。

## 风险与验证

- 阶段顺序变化可能破坏旧 Activation 恢复；使用 standalone 恢复测试覆盖。
- Provider ID 变化可能破坏 AIOS 映射；增加默认与显式兼容两组 Adapter 测试。
- Evidence Contract 变严格可能拒绝旧证据；用清晰错误码和迁移说明处理。
- MCP 与客户端投影涉及文件系统边界；使用临时目录测试，禁止网络和隐式安装。

验证命令：

```text
node --test rex-harness/tests/**/*.test.mjs
node --test scripts/tests/rex-*.test.mjs scripts/tests/workflow-adapters.test.mjs
node rex-harness/bin/rex-harness.mjs doctor
node rex-harness/bin/rex-harness.mjs doctor --providers
git diff --check
```

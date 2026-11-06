# ADR 0009：补齐多客户端真实管理能力，再完善 Console 界面

状态：已接受方向；详细需求仍在澄清，readiness=blocked。
来源：用户本轮 /grill 提出客户端覆盖不全、管理仅有 MCP 入口，并回复「A，然后做B」。
关联：ADR 0008；docs/plans/2026-11-06-console-product-direction.md。

## 背景

当前 Console 的 demo-data.ts 中 TOOLS 只有 claude/codex/gemini；McpWizard 使用该表，明确提示配置写入和连接测试均为模拟。底层 CLIENT_DEFINITIONS 已登记 codex、claude、gemini、opencode、hermes、grok、workbuddy、pi、zcode、qoder，不能用原型列表代表产品支持范围。

## 决策

用户选择 A（真实管理闭环），然后 B（完善界面）。先补齐真实管理能力与客户端覆盖，再完善界面并接入真实操作。B 仍需满足 A 的真实验收要求，不能把模拟操作作为交付完成证据。

- 客户端覆盖以现有权威注册信息为依据；每个客户端只开放实际支持的操作。
- MCP 与 skills 需要实际管理闭环；集成、agent 等已有能力逐项接入，缺口明确展示。
- 保留 ADR 0008 的配置归属、冲突保护、生效范围、客户端限制，以及“写入成功不等于连接成功”的约束。
- 这项决定扩展原一期范围，不改写 ADR 0008 的历史结论。

## 后果与待决项

本文件仅确认方向和顺序，不代表详细需求 ready，不触发实施阶段。

已查证的复用面：

- scripts/lib/foundation/clients/selection/core/definitions.mjs：客户端和 capability 注册。
- scripts/lib/clients/mcp/：通用 MCP 引擎；apps/shell/ui/src/app/api/mcp/route.ts：已有 API。
- scripts/lib/tooling/components/skills/external/install.mjs：外部技能用户级分发，有归属元数据，当前未消费 dryRun。
- scripts/lib/tooling/components/skills/lifecycle/uninstall.mjs：内置目录技能的受管卸载，不是外部技能通用卸载。
- scripts/lib/tooling/cli/parse-args/govern/skill.mjs：没有通用 list/remove 子命令。
- scripts/lib/clients/integrations/cli.mjs：list/add/remove/doctor 命令。

决策依赖：

| id | dependsOn | status | impact | rationale |
| --- | --- | --- | --- | --- |
| delivery-order | — | resolved | critical | 用户接受 A → B，依据本轮回复 |
| client-coverage | delivery-order | resolved | critical | 复用已登记客户端与实际能力，依据用户接受 A 与注册表 |
| skill-operations | delivery-order | open | critical | 需确定技能管理闭环的操作范围；内置与外部技能机制不同 |
| other-capabilities | client-coverage | open | critical | 需核对现有能力哪些可直接管理，哪些只展示限制 |
| acceptance-and-recovery | skill-operations, other-capabilities | open | critical | 范围确定后推演正常、冲突、部分失败及恢复路径 |

下一问题：技能管理是否覆盖发现、安装、更新/同步、按客户端分发、移除与诊断，并同时纳入内置与外部技能。

非目标沿用当前调查边界：不新增聊天客户端、技能市场、请求网关；本轮不修改真实客户端配置。

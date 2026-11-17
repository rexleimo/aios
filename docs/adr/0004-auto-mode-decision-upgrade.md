# ADR 0004 — Auto mode 决策升级：置信度分级 + 路由组状态模式

## 状态

Accepted（2026-11-17）。对标 magpie 功能差距后，针对 auto mode 决策质量与路由策略的两项落地。

## 背景

JEV 决策模型的核心原则是「code owns workflow, model supplies narrow typed judgments」，并且
**按不确定性分级处理、校验后组合**。审视现有 auto mode 发现两处差距：

1. 意图路由（普通对话 auto）由分类器模型自报意图标签，但**没有置信度**；`applyIntentGate`
   在 `routing.mjs` 虽有 `0.7` 阈值，实际作用于硬编码的 0/1 标志，阈值形同虚设。低质量
   分类被当作确定判断直接路由。
2. 路由组只支持 `ordered`（`smart` 是兼容别名），magpie 的 `rotate` / `usage` 等模式缺失。

## 决策

### 1. 意图置信度分级（opt-in）

- `intentRouting.confidenceThreshold`（0..1，可选）为分级门槛。缺省 = 不分级，保持旧行为。
- 分类器提示在启用门槛时要求 `{"intent":"<id>","confidence":<0..1>}`；`parseIntentLabel`
  校验 confidence 必须是有限数且 ∈ [0,1]，非法值 fail-closed 返回 null。
- `applyConfidenceTier(classified, threshold)`：≥ 门槛 → 采用意图；< 门槛或缺失 → 回落默认路由。
  在真实分类器路径（`classifyTurnIntent`）和注入分类器路径（网关消费边界）各应用一次（幂等）。
- 置信度写入决策记录（仅数字，不含密钥/正文），供实时路由图消费。
- 配置在 UI adapter 双向投影并在 `document-schema` 校验；UI 提供「不分级 / 0.5 / 0.7 / 0.9」选择。

### 2. 路由组 rotate / usage

- `GROUP_ROUTING_MODES = {ordered, smart, rotate, usage}`；`orderedGroupMembers` 接受全部四种。
- 新增纯函数 `selectGroupMember(members, mode, state)` 返回 `{member, state}`；`rotate` 轮询，
  `usage` 选用量最低者（并列取第一个），`ordered`/`smart` 忽略 state 取第一个。
- 路由模式从 group 配置流入 `decision.routing`；有状态模式的计数/用量由**网关边界**的
  `createRoutingAffinity` 以 `boundedCache`（配置指纹 + group id 为键）持有，内存态、不落盘、
  不进日志。无会话 pin 时才选成员；会话一旦 pin 即粘住首次成员，保 prompt cache。
- UI 组编辑器把「路由方式」从只读文本改为 Select（顺序 / 轮询 / 最少使用）；未知遗留模式
  仍保留并提示显式转换。
- UI 侧的组校验孪生 `model-catalog.mjs:orderedGroupMembers` 同步接受四种模式，否则 rotate/usage
  组在 UI 里会被判为不可分配（成员不进目标集）；`groups-section.tsx` 摘要标签同步显示新模式的中文名。

## 权衡与被拒选项

- **拒绝把置信度作为必填**：既有测试与外部调用方注入的都是 label-only 结果，强制置信度会
  破坏兼容；改为 opt-in，门槛缺省不分级。
- **拒绝在纯路由模块持有状态**：`orderedGroupMembers` 等保持纯函数；有状态逻辑下沉到
  affinity（网关边界），符合依赖方向且便于测试。
- **拒绝接入 TypeSafe/Jev 云服务**：当前分类器由用户自配模型自报置信度，是「走向校准决策」
  的务实一步；真实校准概率（Choice/Noul 分布）需要专用决策模型，列为后续方向，不引入新依赖/成本。
- **usage 的用量是进程内计数**，重启归零；非跨机配额账本（那是独立的成本/配额产品功能）。

## 验证

- 新增 `model-router-auto-mode.test.mjs`：门槛归一化、fail-closed 校验、分级路由、真实分类器
  自报、rotate 跨请求轮询 + 会话粘滞、纯选择器。
- 全量网关/路由/组测试通过；UI adapter 往返与边界校验、浏览器意图与组编辑器用例通过；typecheck 通过。

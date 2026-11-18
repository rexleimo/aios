# 0011 — 意图分流落地范围：多 relay 客户端可用，不做价格记账

- 状态：已接受（2026-11-18，用户裁定「其他客户端也要考虑，希望自由分配到不同模型以省钱」+「用户会知道价格，只要意图分流功能可以落地就行」）
- 关联：ADR 0004（auto mode 决策升级）、ADR 0010（就地外科改写真实配置）、`docs/plans/2026-11-15-magpie-full-alignment-plan.md`

## 背景

用户要把 AIOS Auto 推到可用的产品状态：任意支持的客户端经网关时，每轮由小模型判断意图，把钱花在对的模型上。对标 magpie（`internal/gateway/classify.go`、`internal/gateway/automode.go`）后确认两件事：

1. 骨架已存在——`routing/intent.mjs`（配置归一、分类提示、typed 标签校验、置信度分级）、`gateway/compatibility/proxy.mjs`（auto 请求分类、会话粘滞、决策记录）、UI「意图分流」区块、`aios-auto` 目标。缺的是分类质量与工程韧性，不是入口。
2. 「auto」有两个不同对象必须分开：AIOS Auto = 按意图选模型；Claude Code auto mode = 权限审查分类器（`dangerous-tool-use-*` beta / `safeguards` 字段 / 本地 `<transcript>`+`<block>` 分类请求）。本仓库对后者零实现（`safeguards`、`AUTO_MODE_SERVER` 全仓零命中）。

## 决策

### 1. 范围：意图分流落地，不含 Claude Code auto mode 兼容

本轮交付 AIOS Auto 按意图分流。Claude Code auto mode 兼容（非 Anthropic 上游剥离 safeguards beta 与字段、接入时写 `CLAUDE_CODE_AUTO_MODE_SERVER=0`、审查请求关推理并补 token 预算）**不在本轮**，作为独立工作项记录，因为它是协议的 beta 面且需要真机验证，会把意图分流的验收拖成两个混在一起的结论。（此条由「只要意图分流功能可以落地就行」推出，用户未单独裁定；如需纳入，另开 ADR。）

### 2. 多客户端：以 relay 矩阵为省钱边界

省钱路由的边界是 `CLIENT_DEFINITIONS` 的 `modelRouting`：

- 可路由（`relay`）：claude、codex、opencode、hermes、pi。目标设为 `aios-auto` 即进入意图分流。
- 不可路由（`own`）：gemini、grok、workbuddy、zcode、qoder，账号绑定，不在本轮范围。

不新增「多客户端开关」——客户端是否经网关已由矩阵与就地接入决定，界面只表达事实。

### 3. 不做价格与费用记账

「便宜」不由系统计算：不引入单价字段、不接入 models.dev 类价目源、不做 token/cost 记账（该部分仍归 WI-3）。意图表由用户手填描述与目标模型，用户自己知道哪个便宜。`COST_ORDER` 五档标签维持现状，不参与意图选择。

### 4. 落地缺口按体验排序（本轮收敛目标）

1. **分类器输入质量**：`extractProtocolUserText` 不剔除 `<system-reminder>`、`<task-notification>` 等 agent 注入块，分类器会把注入噪音当作用户意图；magpie 用 `userWords`/`userSaid` 专门过滤。
2. **短追问上下文**：`继续`/`修一下` 只带本句给分类器；magpie 附上一条用户消息与上一条助手回复（`turnBefore`，各自截断）。
3. **失败回落语义**：分类失败当前删除会话意图并回默认路由；magpie 保留上一轮意图（`Classified.Fallback`）。
4. **分类器工程**：无答案缓存、无失败冷却、无并发合并、超时不可配置（固定 15s，magpie 默认 8s 可在设置内调整）。
5. **零配置模板**：magpie `smart` 模板一键生成「难活给强模型、简单活给便宜模型」并自动挑成员；我们要求用户手写意图。本轮不引入模板（缺价格数据，无法自动挑成员），改由 UI 提供可照抄的意图模板文本。

## 非目标（本轮明确不做）

- Claude Code auto mode（权限审查）兼容。
- 价格表、用量记账、成本展示。
- 每客户端独立意图表（`intentRouting` 维持全局一份；per-client 差异留给后续 ADR）。
- 意图规则携带 effort、嵌套路由组、分类器走网关自体（failover/用量归集）。

## 验收标准（用户可观察行为）

1. GUI「意图分流」启用并填写分类器、意图与目标模型后保存，网关下一个新用户轮即按意图路由，无需重启。
2. claude、codex、opencode、hermes、pi 任一客户端目标设为 AIOS Auto 时均生效；显式指定模型或角色的请求绕过分类器。
3. 工具续轮不重复分类，沿用本轮意图。
4. 分类器失败、超时或置信度低于门槛时，请求仍正常完成并走默认路由，决策记录写明原因。
5. 分类器收到的输入只含用户原话，不含 agent 注入块；短追问携带上一轮用户消息与助手回复。
6. 路由图可见 intent、分类器模型、置信度与是否回落。

## 第一个可验证切片

**分类器输入质量**：对同一份带 `<system-reminder>` 的请求，分类器 prompt 只含用户原话；短追问（`继续`）的 prompt 携带上一轮上下文。用注入 mock 分类器验证，零扣费；真实分类器扣费验收属 `pending-manual-approval`。

## 后果

- 意图分流从「骨架可用」推进到「判断可信」，但对 Claude Code auto mode 经网关走非 Claude 模型的风险保持明示；该风险需要在文档与界面提示，直到独立工作项落地。
- 不引入价格数据意味着界面不能承诺「这轮更便宜」；文案只能表达「这轮交给 X 模型」。

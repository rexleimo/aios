# 2026-11-19 — 模型路由控制台四块 magpie 对齐

- 状态：待用户确认方案
- 工作项：`magpie-console-alignment-2026-11-19`
- 来源：用户 4 张截图 + 需求「四块全做，先出 plan 再实现」
- 事实基线：见下方 §0 已验证事实

## 0. 已验证事实（先立证据，不靠静态推断）

| 项 | 结论 | 证据 |
|---|---|---|
| auto + 意图能否用 | **能用**，但意图的 `modelId` 必须是具体模型；填 `auto` 视为 null 回落 | `router.mjs:104` `wireTarget?.kind==='auto' → requested=null`；`routing.test.mjs` 断言 `requestedModel:'auto'→explicit:false`（11/11 通过）；真实日志 `decisions.jsonl` 末条 `intent "implement" classified by antigravity-gemini-3.8-flash → qwenwork-qwen3.8-flash`、`explicit:false` |
| 网关运行态 | 健康，11/11 模型就绪；`/v1/models` 有 `aios-auto` | `curl :8686/health` |
| magpie 本地实例 | 127.0.0.1:3425 提供 usage/trace/quotas/statusline API（桌面应用，非 Web UI） | `curl :3425/...` 实测 |
| 决策日志字段 | 已有 clientId/modelId/intent/status/latencyMs/attempts/failoverCount/usage(含 cached_tokens)；**无** per-stage 时间拆分、**无** 上下文窗口 token 分解、**无** 额度重置时间 | 真实 entry keys 实测 |
| 现有前端 | RoutingGraph(路由图) / GatewayControl(启停接入) / RequestHistory(决策表) / ClientExceptions(例外) 均存在 | 代码读取 |

## 1. 四块工作分解

### 块 1 — 客户端例外 UI 对齐（图1）
现状：`client-exceptions.tsx` 已有「选择客户端 + 添加例外 + N 个例外徽章 + 全部继承空态」，功能完整。
对齐动作（**需你确认对齐目标**，见 §3 决策点 D1）：
- 结构已与图1一致（下拉框 + 添加按钮 + 计数徽章），主要差在视觉密度与配色。
- 若对齐 magpie 深色风格：调整 padding/圆角/徽章 tone、按钮层级，保持现有文案与交互不变。
- 低风险，纯样式，不动数据流。

### 块 2 — 路由状态卡（图2：在线模型 + 连接链 + 额度重置倒计时）
现状：`GatewayControl` 已有运行态/接入态但**无**「每个模型一行 + 当前活跃 + 重置倒计时」的可视化。
数据缺口与方案：
- 「在线模型 / 连接链」：来自 `/api/model-routing/gateway` 的 `configuredModels/readyModels/clients`，以及 `decisions` 的 `byClient/byModel/edges` → 可复用 `RoutingGraph`，不另造。
- 「额度重置倒计时（17 天后重置）」：**我们网关目前不记录额度窗口**（magpie 的 `:3425/v1/magpie/quotas/history` 有 `resetsAt/left`）。方案：在决策日志/网关状态里为「当前活跃模型」补一个 `quotaResetsAt?` 可选字段，GUI 读它算倒计时；无数据时显示「未记录」，**绝不编造**。需要确认数据来源（见 D2）。

### 块 3 — 请求路由逐步 trace（图3）
现状：`RequestHistory` 是决策表 + 详情弹窗；magpie 的 `:3425/v1/magpie/trace` 返回每个请求的 `order`（每跳 provider/model/状态）+ 时间线。
我们的决策日志**已有**足够字段拼出 90% 的 trace：
- 步骤链：`clientId → 目标模型(modelId) → attempts[](每次尝试的 modelId/providerId/status) → 最终 status`。
- 路由依据：`reason` / `intent` / `classifierModel` / `intentDescription` / `explicit` / `failoverCount` / `affinityPinned`。
- 失败原因：`status` + `attempts[].status`（图3 里 502 失败重试这类完全能还原）。
- 时间拆分「时间花在哪里」：**当前只有总 `latencyMs`，无分段**。这是真实缺口（见 D3）：要么网关补记 per-stage 耗时（ingress/classifier/upstream），要么 GUI 诚实显示「仅记录总耗时」并说明限制。

实现：在 `RequestHistory` 的详情弹窗升级为「步骤时间线 + 路由依据 + 时间条」，复用现有 fetch，不新增端点。

### 块 4 — 上下文窗口 / 缓存命中（图4）
现状：`RequestHistory` 详情已显示 input/output tokens；决策日志 `usage` 含 `cached_tokens/cache_write_tokens/prompt_tokens`（magpie `:3425` usage 也有 `cache_read/cache_write`）。
缺口：
- 「已用上下文 X / 总量 Y」「约还能容纳 N 个请求」：需要模型的**上下文窗口上限**（来自模型目录/metadata）和每请求 token 增量。窗口上限数据可能缺失（见 D4）。
- 「提示词缓存命中率 0%」：可由 `cached_tokens / prompt_tokens` 计算，诚实呈现（命中 0 就显示 0，不美化）。

实现：新增 `ContextWindowPanel`，从最近决策的 usage 聚合 + 模型目录的 context window（若有）计算；无上限数据时明确标注「窗口上限未配置，仅显示已用 token」。

## 2. 实施顺序与验收
1. 块1（样式）→ 块3（trace，数据最全，价值最高）→ 块4（上下文）→ 块2（状态卡，依赖额度数据决策）。
2. 每块：改代码 → `npm run test:affected`（repo root）→ 相关 `console-facts`/浏览器测试。
3. 收尾：`cd apps/shell/ui && npm run typecheck && npm run build`；手动冒烟走真实网关日志。
4. 全程遵守：不伪造数据、无数据显示「未记录」、不展示密钥/正文。

## 3. 需要你拍板的决策点（不猜，问清楚）

- **D1 图1 对齐目标**：对齐到 magpie 深色风格 / 还是仅按现有 DESIGN.md 设计系统微调间距密度？
- **D2 额度重置倒计时的数据来源**：(a) 网关新增额度窗口记录（工作量较大，需改写侧+网关） / (b) 先做占位「未记录」，等 magpie 配额 API 可接入再补 / (c) 这轮跳过倒计时只做在线模型+连接链？
- **D3 trace 时间拆分**：网关是否愿意补记 per-stage 耗时（ingress/classifier/upstream）？否则 GUI 只能显示总耗时。
- **D4 上下文窗口上限**：模型目录里是否已有/要补 context window 字段？没有的话块4 只能显示已用 token + 缓存命中，无法算「还能容纳 N 个请求」。

## 4. 不做（边界）
- 不改网关路由逻辑本身（auto+意图已验证能用，不动）。
- 不引入真实扣费测试（需显式批准）。
- 不做订阅登录/成本计费（属 WI-1/WI-7，超出这四块）。

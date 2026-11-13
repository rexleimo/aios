# P0 探针发现记录 — AIOS 本地 LLM 网关 + 可配置模型路由

- 日期：2026-11-13
- 关联计划：[2026-11-13-gateway-model-routing-plan.md](2026-11-13-gateway-model-routing-plan.md)
- 状态：进行中（零成本部分已完成；live 探针待显式批准）

## work-p0-routing-unknowns（部分完成）

### model id 核实 — 已完成（零成本，真实目录证据）

relay 目录端点 `GET https://coding.rexai.top/api/v1/protocol-models` 返回 **HTTP 200**，4 协议共 51 款模型。据此核实计划里的未决 id（**无凭空 id**）：

| 计划未决项 | 真实结论 | 协议 |
|---|---|---|
| Qwen | relay 供应 **`qwen3.8-flash`**（不是泛称 Qwen） | openai-chat |
| gpt-6.1-sol | **存在**，relay 供应（注册表此前只有 gpt-5.6-sol） | openai-response |

完整目录（实测）：
- **openai-chat**（`/openai/v1/chat/completions`，13）：beam-free, deepseek-flash, glm-5.3, glm-5.3-flash, gork-4.6, grok-4.5, grok-4.6, grok-4.7, hy4, mimo-v2.6-flash, minimax-m3.1-flash, muse-spark-1.3-contributor, qwen3.8-flash
- **openai-response**（`/openai/v1/responses`，9）：gpt-5.5, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-6-astra, gpt-6-luna, gpt-6-sol, gpt-6.1-sol, gpt-6.1-terra
- **claude**（`/claude/v1/messages`，19）：claude-fable-5/5-1/5-2/5.1, claude-haiku-4-5-20251001, claude-haiku-5-5, claude-opus-4-5-20251101/4-6/4-7/4-8/4.8/5/5-5, claude-sonnet-4-5-20250929/4-6/5/5-5, deepseek-v4-flash, deepseek-v4-pro
- **gemini**（`/gemini/v1beta/models`，10）：gemini-2.5-flash, gemini-2.5-pro, gemini-3-flash-preview, gemini-3-pro-preview, gemini-3.1-flash-lite, gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.7-flash, gemini-3.8-flash, gemini-4-argon

含义：P1 供应商注册表的「供应模型」以此目录为真实来源；deepseek 同时经 claude 与 openai-chat 供应；grok 经 openai-chat 供应（relay 侧）。

### own 模式（gemini/grok 客户端 endpoint 覆盖）— 待探针

relay 供应 gemini/grok 模型 ≠ own 模式客户端可被改 base URL。需对 gemini/grok 客户端做真实握手验证 endpoint 覆盖是否生效，给 can/cannot/conditional 结论。**未做，不打包票。**

## work-p0-gateway-feasibility（部分完成）

### 透传网关种子 — 已建并测（零成本，Hono 运行时无关）

- **框架选型（用户裁定）**：用 **Hono**（Web Standard Request/Response）而非裸 `node:http`，便于未来 JS 运行时迁移（Bun/Deno/Workers）。`hono@^4.12.27` + `@hono/node-server@^1.19.14` 已从 MCP SDK 的传递依赖提升为 package.json 显式直接依赖（lock 已同步）。
- 架构分层：
  - `scripts/lib/tooling/model-router/gateway/app.mjs`：`createGatewayApp` → **运行时无关的 Hono app**，只用 Web Standard API（fetch/TextDecoder/TransformStream/URL/Response），无 node:http/Buffer。`/v1/messages` 转发到上游 claude 端点，SSE 流式回传（TransformStream flush 落整轮 wall-time），每请求决策记录（model/target/status/latencyMs）。
  - `scripts/lib/tooling/model-router/gateway/passthrough.mjs`：`createPassthroughGateway` → **Node 适配器**（@hono/node-server），只绑 127.0.0.1；迁移运行时只换这一层，app.mjs 不动。对外 API 稳定（listen/close/address/decisions）。
- 信任边界实测修正：只认浏览器信号 `Origin`/`Sec-Fetch-Site`；**不拦所有 Sec-Fetch-***——Node fetch（含 claude CLI）自动带 `Sec-Fetch-Mode: cors`，拦它会误杀合法服务端调用。
- 测试 `scripts/tests/learning/model/model-router-gateway-passthrough.test.mjs`：**7 用例全过**（转发+鉴权透传+决策记录、SSE 流式有序、跨源拒绝、Sec-Fetch-Site/Mode 精确边界、health、上游不可达 502、intake token）。连同既有 model-router 测试共 **33 过 0 挂**（本地 mock 上游，零扣费）。

### claude relay 配置（实测，密钥已脱敏）

`~/.claude/settings.json` env：`ANTHROPIC_BASE_URL=https://coding.rexai.top/api`、`ANTHROPIC_AUTH_TOKEN=<67 chars，已脱敏>`。
- 关键：claude CLI 实际打到 **`/api/v1/messages`**（base 带 `/api`），不是目录里的 `/claude/v1/messages`。live 探针的上游必须用 claude 的真实 base（`https://coding.rexai.top/api` + `/v1/messages`），网关 upstream 可配。
- 鉴权由 claude CLI 自带（settings.json 的 relay token），网关原样透传，探针无需自行取密钥。

### live 探针 — 待显式批准（扣费）

待办：起网关 → `claude --print` 以 `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` 覆盖 → 验证单轮端到端、不卡死、实测延迟、决策记录。
- **需验证的可行性点**：进程 env 的 `ANTHROPIC_BASE_URL` 覆盖是否压过 settings.json 的同名值（若 settings.json 优先，覆盖不生效，需另寻可逆办法；不改用户 settings.json）。
- 这一步触发真实 relay 模型调用（扣费），按 implement-spec 准入需**人工显式批准**后才跑。

## 实施状态（2026-11-14 更新）

核心功能 P1–P4 已全部落地并零扣费验证。提交链：2978d997(P0 种子) → ceb5922e(P1) → 4a5390bd(P2 翻译) → 98183d1e(P2 路由) → 68f59efb(P3) → 8c2eed81(P4) → aaf6d682(P2 gemini+可用性) → e27cbff3(P4 每客户端) → 5f8b9ecd(P2 流式翻译)。

| 工作项 | 状态 | 证据 |
|---|---|---|
| P1 供应商注册表 | ✅ | providers.mjs，7 用例；明文 key/坏 env 引用 fail-closed |
| P1 客户端×角色矩阵 | ✅ | client-role-matrix.mjs，6 用例；env>每客户端>全局>roleDefaults |
| P2 协议翻译 | ✅ | translate.mjs claude↔openai-chat↔gemini（请求/响应/工具），非流式+流式 |
| P2 请求级路由 | ✅ | router.mjs 矩阵→模型→供应商，可用性/配额故障切换，决策记录无密钥 |
| P2 流式/超时/脱敏 | ✅ | proxy.mjs + stream-translate.mjs，每请求 AbortController 超时(504)，跨协议流式翻译 |
| P3 网关执行器 | ✅ | gateway-phase 可插拔执行器，HTTP 驱动取代冷进程；端到端链用例；spawn 保留回退 |
| P4 GUI 设置面 | ✅ | ModelRoutingPanel（供应商面板+全局/每客户端矩阵），浏览器实测读写单一配置源 |

测试：model-router 全套 **65 过 0 挂** + shell 配置 **5 过**；`ui:typecheck` 干净；浏览器实测设置页渲染真实矩阵 + GET/PUT 读写回环（含变更检测/回滚）。shell 套件 2 挂为既有 skill-management `/var` 符号链接环境问题，与本功能无关。

### 待人工验证（扣费，需显式批准，未自主触发）
- **P0 live 透传探针**：真实 claude 会话经网关→relay 单轮往返（验证 env 覆盖压过 settings.json、实测延迟、不卡死）。
- **P3 真实派发**：真实多阶段工作项经网关执行器跑通，实测 wall-time 对比 spawn 基线。
- 这两项触发真实 relay 模型调用（扣费），按准入需用户批准；机制本身已用 mock 上游端到端验证。

### own 模式（gemini/grok）
网关已结构性把 own 模式客户端排除出模型分配（`getClientModelRouting !== 'relay'` → `ownDefaultModel`，有用例钉住）。其客户端 endpoint 能否覆盖以接入网关仍待真实握手探针（不打包票）；不影响 relay 客户端主线。

### 已知增量余量（非阻断）
- 流式工具调用翻译（本期流式覆盖文本增量；非流式工具调用已全）。
- gemini 流式 SSE 翻译（本期 gemini 非流式已通；流式直通同协议）。
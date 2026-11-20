# 2026-11-19 — 插件系统三方对比：magpie × ADR 0007 × 我们现状

- 状态：调研报告，供用户拍板架构方向（不动代码）
- 触发：四块 magpie UI 对齐工作中，用户提出「整个 app 体系 + 客户端 agent 辅助都要有插件系统」，并要求先出三方对比
- 事实源：`http://usemagpie.ai/docs/plugins`、`gateway-middleware.md`、`gateway-request-hooks.md`（2026-11-19 抓取）；本地 `docs/adr/0007`；本地源码实测

---

## TL;DR（一句话结论）

magpie 的插件是**网关进程内的请求级中间件 + 一个 Bun 插件宿主进程**,边界清晰、延迟极低、可信代码前提;ADR 0007 的插件是**桌面壳的 manifest 家族(client/integration/panel)**,能力更广但进程隔离后置 S4;**我们网关层目前零插件系统**。三者不是同一个东西,但共享一个内核哲学:**边界声明 + 沙箱 + 超时 + 可观测**。建议不是「抄 magpie」,而是分层吸收:网关请求面抄 magpie 的 middleware/hooks 形状(有超时/回滚/沙箱),壳层沿用 ADR 0007 的 manifest,安全底座统一到「不可信代码必须进程隔离」。

---

## 一、magpie 插件系统（事实,来自官方文档）

magpie 把「插件」拆成**四种互不相同的东西**,各自运行环境、能力、延迟预算都不同——这是它最关键的设计,不是笼统的「插件」二字:

| 类型 | 运行位置 | 能力 | 延迟预算 | 可信要求 |
|---|---|---|---|---|
| **Provider plugin** | 独立 Bun 进程(plugin host),stdin/stdout JSON-RPC | 登录、声明 provider/模型、签名请求、模型列表、用量、刷新 token、checkin | 无硬上限(startup+RPC <11s) | npm 安装脚本不跑;「Bun plugins have host privileges; install trusted code」 |
| **Async request hooks** (`onRequest`/`onResponse`) | Bun,每 agent 请求一次,路由前 | 注入项目上下文(如 recall);**不能改 model/stream/tools**,改了即回滚 | 每 hook 默认 1s,链钳制 2–10s | 同上 |
| **Gateway middleware** (`onRequest/onAccount/onProvider/onEvent/onResponse`) | **网关进程内**,Go 写的 moejs JS 引擎,每请求独立 runtime | 改模型名、改 system prompt、拒请求、改/隐藏回复、计数、按账号跳过 | hook 250ms / event 50ms / load 1s | 无 Node API、无 fetch、无 timer;只能相对路径 import;60 行/分日志上限 |
| **gateway strategies + onUsage** (`*.gateway.js`) | 网关进程内(moejs) | 自定义路由顺序 `strategies`、用量行 `onUsage` | strategies 20ms / onUsage 250ms | 同上 |

关键机制(可直接借鉴的工程细节):
- **回滚语义**:hook/middleware 返回的 body 若是 clone,失败/超时/非法返回的 mutation 全部丢弃;改了受保护字段(model/stream/tools)的 hook 按失败处理。
- **反射令牌**:`onAccount` 里的 account 用 32 hex 的 `ref` 代替 email/id,且每个 middleware 不同、重启稳定 → 插件能记住账号而不接触 PII。
- **预算钳制**:链求和后钳到区间,启动+RPC 有总上限;超时/抛错「当它不存在」放行请求(fail-open,不阻断用户)。
- **失败可观测**:Settings → Plugins 显示每个 hook 的调用数、平均耗时、失败数、最后错误;统计不保留私有文本。
- **双层运行时的理由**:高频流式事件放进程内 moejs(每 hook ~1μs,Bun 往返几十 ms);需要 I/O 的放 Bun。**按延迟/权限分层,而非一刀切**。

## 二、ADR 0007 插件契约（我们已拍板的方向）

- **一个 manifest 家族,三个 kind**:`client`(把 AIOS 装进客户端/生态)、`integration`(第三方 skill + MCP,现有 `integrations.json` 的开放版)、`panel`(给宿主加一屏)。
- **共同字段**:`schemaVersion` / `id` / `version` / `permissions` / `lifecycle`(install·upgrade·disable·remove) / `evidence`。
- **首期**:只把 `claude`+`codex` 两个客户端降成 manifest,其余走代码路径,要求行为逐字节一致(diff 证据)。
- **注册表双轨(C 案)**:官方轨(PR 审核 + pinned commit + verified sha256 + per-client plan + live handshake)、本地轨(本地路径/私有源,`untrusted` 标记 + 显式确认)。
- **明确后置**:第三条 npm 包 / git URL 自发布「推迟到具备插件进程隔离之后再评估——理由是插件能执行命令,破坏面不同于 magpie 的单请求中间件」。S4(签名/公证)也后置。

## 三、我们现状（实测）

| 维度 | 事实 |
|---|---|
| 网关插件/middleware/hook | **零**。`scripts/lib/tooling/model-router/` 全目录无 plugin/middleware/hook 字样 |
| 路由策略 | 只有 `ordered`;`groups.mjs:46-47` 明确拒绝 smart/rotate/usage/pace |
| 网关已具备的零件 | 协议互译(4 方言)、工具调用翻译、意图路由、请求历史决策日志、可用性状态机、流式转发、脱敏(规则式) |
| 壳层插件 | ADR 0007 契约已定但**未落地**(client/integration/panel 仍是设计,无 manifest 实现) |
| 决策日志字段 | client/model/intent/status/latency/attempts/usage(**含 cached_tokens**);无额度窗口、无上下文上限、无 per-stage 时间 |

## 四、三方逐项对比

| 能力轴 | magpie | ADR 0007(目标) | 我们现状 |
|---|---|---|---|
| 插件形态 | npm/git/folder → OpenCode v1 hook 函数 | manifest 家族(3 kind)+ 生命周期 | 无 |
| 运行隔离 | 分层:provider/hooks 在 Bun 宿主,**middleware 在网关进程内 moejs** | 进程隔离后置 S4;首期两轨均需人工确认 | 无 |
| 安全模型 | 「可信代码」前提,install scripts 不跑,有反射令牌防 PII | untrusted 标记 + 显式确认;自发布需先有进程隔离 | 无外部代码执行面 |
| 延迟治理 | 每类 hook 明确 ms 预算 + 钳制 + fail-open | 未细化 | 无 |
| 可观测 | Plugins 面板:调用数/耗时/失败/最后错误,不存私有文本 | manifest 带 `evidence` | 决策日志可观测,但无插件维度 |
| 路由策略可插拔 | `strategies` 可插(20ms) | 未细化 | ordered 硬编码,明确拒绝其他模式 |
| 用量/额度 | `auth.usage` + `onUsage` 行,配额账本成熟 | 未细化 | 决策日志有 token 无额度窗口 |
| 与客户端 agent 的关系 | 网关自动被所有 agent 共用;SDK 嵌 agent | `client` kind = 把 AIOS 装进客户端 | 已做就地外科改写接入(claude/codex/pi…),但无插件化 |

## 五、契合度分析：用户愿景 vs 两套设计

用户愿景 = ①app 整个软件体系可插拔 ②客户端 agent 辅助也可插拔。

- **ADR 0007 天然覆盖①**:`panel`(加一屏)、`integration`(skill+MCP)就是「app 体系可插拔」;`client` kind 就是「把 AIOS 装进客户端」。
- **②「客户端 agent 辅助也能加载插件」是 ADR 0007 与 magpie 都没完全覆盖的空白**:magpie 是「网关插件被所有 agent 共用」+「library 给 agent 写 hook/skill/MCP」,但插件不随 agent 走;ADR 0007 的 `client` 解决的是「装进客户端」而非「客户端里再加载插件」。这一层需要新设计。
- **magpie 的 middleware 分层思想最值得直接吸收**:它解决了「高频请求面插件不能慢、不能碰到 PII、失败不能阻断用户」三个工程难题,正好对应我们四块里 D2(额度)、D3(时间)的数据来源问题——`onUsage` 就是额度/用量行的标准形状。

## 六、给用户的三条路径（供拍板,不替你定）

- **路径 1 — 分层吸收(推荐)**:不做单一「大插件系统」。网关层按 magpie 形状先做只读的 `usage-provider` / `quota-provider` 接口(内联、有超时、fail-open、不执行外部代码),把 D2/D4 数据接进来;壳层沿用 ADR 0007 manifest。等这套稳定,再评估「客户端 agent 内加载插件」新层。**四块 UI 不等它,先用只读数据源占位落地。**
- **路径 2 — 完整平台先行**:按 ADR 0007 把 manifest 三 kind + 双轨注册表 + 进程隔离一次做出来,再把四块和 agent 辅助插件都建在其上。范围大、S4 安全童子军必须先补,周期长。
- **路径 3 — 纯 magpie 复刻**:照搬 provider/middleware/hooks 四类到网关。与 ADR 0007 的 manifest 体系会形成两套并行插件概念,需先决定谁收敛谁,不建议直接做。

## 七、待用户拍板的问题

1. 插件系统的**第一优先级**是 app 体系(ADR 0007 panel/integration)还是客户端 agent 辅助(②空白层)?
2. 是否接受「**分层、不强行统一成一套插件 API**」(magpie 自己就是 4 套),还是坚持一个统一 manifest?
3. 「客户端 agent 辅助加载插件」——是指 AIOS 作为 agent 插件(已部分做了),还是 agent 内的 AIOS 助手再加载第三方插件(全新增)?
4. 安全底座:是否现在就把「不可信代码进程隔离」提为前置硬门(否则 npm/git 自发布轨不能开)?

# 0010 — 客户端接入改为 magpie 式「就地外科改写真实配置」

- 状态：已接受（2026-11-15，用户裁定「这次的网关需要走真实配置了」）
- 关联：ADR 0007/0008（控制台是本机 agent 栈控制面）、`docs/plans/2026-11-13-gateway-model-routing-plan.md`

## 背景

原「接入客户端」生成**隔离工件**到 `~/.aios/gateway/`，用户必须手动 `aios model-router connect`，再用特殊命令启动每个客户端（`claude --settings …`、`OPENAI_API_KEY=… CODEX_HOME=… codex`、`HOME=… pi`），网关地址写死在工件里；普通 `claude`/`codex`/`pi` 命令不走网关，隔离目录还丢原有 MCP/历史。用户对照 magpie（usemagpie.ai）指出：magpie 不需要用户自行配置——GUI 选模型即自动接好。

查证 magpie 官方文档：其主路径是**GUI 触发、外科手术式改写客户端真实配置**（只动需要的 key，保留注释/顺序/缩进，原子写），用户零手动；env 变量/复制命令只是给未知工具的兜底，`claude-magpie` 隔离启动器是可选替代。本机 `~/.pi/agent/*.before-magpie` 备份印证了 magpie 的「写前备份原值」机制。

## 决策

接入默认改为**就地外科改写真实配置**，由 GUI 每客户端「接入/还原」按钮触发（`confirm:true` 门）：

- claude → `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`；
- codex → `~/.codex/config.toml` 的顶层 `model_provider` + 带标记的 `[model_providers.aios-gateway]` 块（内联 `experimental_bearer_token` 占位、`requires_openai_auth=false`，**免 shell env、免特殊启动命令**——已零扣费探针实证 codex 0.169 接受该配置并直接发起请求）；
- pi → `~/.pi/agent/settings.json` 的 `defaultProvider/defaultModel` + `models.json` 的 provider 条目。

纪律：只动网关需要的 key；保留其余字节；原子写（temp+rename）；**原值备份**到 `connect-backup.json`，`disconnect` 还原原值（原本不存在的文件删除）；**绝不删网关 pidfile/日志**（修正旧隔离 disconnect `rmSync` 整个 stateDir 的破坏性行为）。网关 localhost 信任、服务端按 (client,role) 矩阵路由并注入真实上游 key，故客户端配置只写占位 token、不写模型名（模型由矩阵决定）。

纯函数编辑器 `connect/editors.mjs`（text→{text,backup}），编排 `connect/inplace.mjs`（fs 可注入）。`--isolated` 保留旧隔离工件模式作可选兜底。

## 被拒选项

- **保留隔离工件 + 自动装 shell 别名**：仍要用户用特殊命令，普通命令不走网关，达不到 magpie 零配置体验。
- **写模型名进客户端配置（magpie 式 per-agent 选模型）**：本网关按矩阵服务端路由，客户端模型名会被覆盖，写入徒增 codex model-catalog 复杂度；模型选择归路由矩阵面。

## 后果与权衡

- **放宽「绝不碰用户真实配置」约定**：经用户明确授权；以外科合并 + 原值备份 + 原子写 + GUI 确认 + 可还原把风险降到最低。开发/测试只用临时 HOME 夹具，真正写入只由用户在 GUI 点「接入」触发。
- 与 magpie 共存：本机 pi 当前由 magpie 管理，接入会覆盖其 `defaultProvider`，备份记录 magpie 原值，disconnect 还原。
- 新增 17 个测试（editors 8 / inplace 7 / CLI 2）+ 守卫扩展；回归基线不变。
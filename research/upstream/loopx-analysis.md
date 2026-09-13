# LoopX 深度分析（2026-09-12）

对象：[huangruiteng/loopx](https://github.com/huangruiteng/loopx)，克隆于 `research/upstream/loopx`（shallow，v1.0.3，PR #4251）。
分析方式：三路并行深读（运行时集成 / 产品面与成熟度 / 状态与协调）+ 关键承重点人工抽查。

## 1. 一句话结论

LoopX 是一个**用 AI agent 高吞吐开发出来的长任务控制平面产品**：README 自称 "lightweight state kernel"，实测约 **100 万行 Python（2,571 文件）+ 9.7 万行 TS**，带 Tauri 桌面壳、PWA chat 工作台、飞书集成、自更新通道、525 个测试文件、12 条 CI workflow。
它的营销重点"200+ 小时长任务"在自家 README 里被明确限定为**墙钟项目时长，不是连续模型执行，更不是无人值守自主运行**。

## 2. "200 小时"的真相（README 原文验证）

> "This measures wall-clock project time, not continuous model execution or unattended production autonomy." — README.md Evidence 节

两个展示案例：
1. **OpenViking 贡献序列**：作者本人在 volcengine/OpenViking 的 PR 贡献轨迹（人类+agent 协作数周），200+ 小时 = 首个 PR 创建到最后一次 review 的日历跨度。
2. **Auto ML showcase**：脱敏的 owner-run 实验轨迹图。README 自认 "not a claim of continuous compute, independent reproduction, a production result"；"The redacted image is not sufficient to reproduce the underlying experiment independently."

可复现的部分：
- **SWE-Marathon 对照**（15 任务 × 3 臂，GPT-5.6 Sol，预算压到 30%）：裸 codex partial 0.710 / 自收工 0/15 / $368；codex 原生 goal 0.767 / 12/15 / $533；LoopX heartbeat 0.778 / 13/15 / $830。但每格仅 1 trial、自称"探索性观察"，且 **SSH Goal 与 Codex CLI 两组数据已撤回**（等待重验）。
- 独立用户报告：4 天无人值守 agent、>13 小时长跑——标注为 "user-reported"，未独立复现。

**判断**：机制是真的（quota 门、turn 契约、恢复路径都有代码和测试），"自主 200 小时"是叙事包装。它最诚实的地方恰恰是把证据边界写得很清楚。

## 3. "1000 agents" 声称不存在

全仓库（代码+文档）无任何 "1000 agents" 声称。真实多 agent 形态：
- `docs/reference/protocols/peer-agent-runtime-v1.md`：无 durable leader，work ownership 来自 todo claim / task lease；未认领 replan 义务按 canonical work key **hash 到已注册 peer**（确定性分派）。
- `demo/visible_multi_agent_tmux.py`：tmux 多 pane 启动 2-3 个 Codex TUI。
- 强 lease 在 TS（`control_plane/work_items/task_lease_*.ts`），Python 侧 `claimed_by` 自认是 "soft owner for visibility only"。
- 并发测试只到跨进程双写者级别。示例里 `registered_agents` 就是 `["codex-alpha", "codex-beta"]`。

## 4. 架构拆解（值得学的部分）

### 4.1 无守护进程的循环
LoopX 本体不带 daemon。循环寄生在三处：宿主扩展事件循环（pi/opencode 进程内插件）、宿主原生 loop（claude `/loop` + MCP、agy/kiro `/goal`）、外部定时器（cron/launchd/RRULE）+ `loopx turn run-once`。核心心智模型：

```
LoopX decides -> agent CLI executes -> validator proves -> LoopX commits
```

### 4.2 Turn 契约（最硬的工程）
- 请求：`loopx_turn_host_request_v0` 从 stdin 喂给宿主 CLI/adapter；结果必须是 stdout 上单个 ≤12KB 类型化 JSON（`loopx_turn_result_v0`）。
- **独立 validator**：单独进程从 stdin 读 host result，exit 0 才算过——executor 不得自验完成声明。
- 结算：`turn_key` CAS → todo writeback → quota spend（`effect_ref` 幂等防重复扣费）→ scheduler ack。只有 material 结果（validated_progress / validated_completion / repair_required / replan_required）才扣费。
- 发布资格门（`scripts/qualify-native-goal-release.py`）断言每笔 spend 带 `settlement_identity`，receipt 必须含 `VALIDATION + DURABLE_WRITEBACK + QUOTA_SPEND`，最终 `quota should-run` 返回 `terminal_no_followup`。
- 失败分类到 failure_kind（rate_limited / provider_overloaded / model_requires_newer_codex …），探针失败一律 fail-closed。

### 4.3 Quota 经济学（无人值守的核心）
- compute 是占空比：`DEFAULT_COMPUTE_QUOTA=1.0` / 24h 窗口 / 1 分钟 slot = 每天 1440 个 slot。quota 只管算力，不管人类审批。
- 状态机：`paused(goal_stopped|compute_zero) / blocked_health / operator_gate / waiting / focus_wait / throttled / eligible`。
- **safe_bypass 旁路**：operator_gate 阻塞交付时，允许心跳花 1 个 bounded turn 做只读 steering/分析/文档——"gate 不冻结整个 goal"，且 policy 文本随 run payload 落盘可审计。
- **self-repair 白名单 lane**：修复自己控制平面的投影允许花额度，但与正常交付隔离（`self_repair_allowed=True, normal_delivery_allowed=False`）。
- effective_action 优先级链：safe_bypass_recovery > recovery > self_repair > repair_bridge > workspace_guard > automation_prompt_upgrade > peer blocked。

### 4.4 节奏管理
- 定时器只是唤醒器（"The timer only wakes the executor. LoopX decides"）。
- 默认 3 分钟起步，按 `scheduler_hint` 阶梯退避；`cadence_class`（active_work / monitor_wait / human_gate）；连续 unchanged-poll 后建议外部循环停止。
- `long_task_cadence.py`：blocked → wait；连续小粒度进展 → widen/replan；material 进展 → keep。

### 4.5 状态存储
- 真相源：append-only JSONL 事件流（`event_sourced_state.py`，事件不可变硬编码、event_id 幂等去重、单调 sequence、sha256 校验和）。
- 人类界面：`ACTIVE_GOAL_STATE.md` Markdown 投影，与事件流互相投影；**投影漂移检测**（Next Action 与 todo 投影不一致会告警并拒绝 heartbeat delivery）。
- 并发：内核级文件锁（fcntl/msvcrt）+ holder 记录 + 超时 incident JSONL（能回答"谁在持有锁、该做什么"）。
- 备份/迁移：tar + sha256；legacy runtime 交叉锁迁移。

### 4.6 治理形式化
- **boundary_authority**：写权限授权是带 `write_scope/source/decision/recorded_at/expires_at` 的检查点条目——有期限、有出处、可过期，不是永久角色。
- **authority registry**：信息源注册 role/freshness/boundary/revision/conflict_rule，原始 ref 只存 sha256。
- **dreaming lane**：闲置期探索 lane 只产提案（refactor_warning / memory_consolidation / archive_suggestion / exploration），`may_execute_protected_actions=False` 等 5 项权限封印，promotion 需 operator 批准 + 边界扫描。
- **operator_gate resume contract**：approve 不是"放行"而是要求 resume 时重读全部当前权威（registry、state、quota、repo 快照、policy）。
- **public_safe_text**：隐私扫描单一规则源，4 个 validator owner + TS 镜像共享同一测试语料钉死契约；HTTP/dashboard 输出默认过边界扫描。

### 4.7 宿主集成矩阵（10+ 运行时，含 pi 和 zcode）
| 宿主 | 模式 |
|---|---|
| pi | 进程内 TS 扩展（`agent_settled` 事件 + timer），CAS binding + epoch guard |
| claude-code | 不用宿主 `/goal`（它从 transcript 判完成，冲突），写 `.claude/loop.md` 用原生 `/loop`，loopx 提供 MCP `should_run/claim_task/complete_task` + 可选 PreToolUse 硬化 hook |
| codex | `exec --json` JSONL，output-schema 类型化结果，session resume，错误码映射 failure_kind |
| opencode2 | 进程外持久 worker 走 HTTP API，TUI 关了也能续 |
| dsh (DeepSeek Harness) | 进程内 SDK，session id 由 (goal,agent,todo) lineage 哈希派生防悄悄续旧会话 |
| kunluncode | app-server 机器 API `thread/goal/set` |
| agy / kiro | 绑定宿主原生 `/goal`（带版本探针："verified against agy 1.1.18 live"） |
| traex | `exec --output-schema` dumb translation layer |
| **zcode** | **只装受管 skill facade `$loopx`，agent 自己每 turn 问 quota**（最薄的一档） |

每宿主契约 "checked against the host itself, not transcribed"——有运行时探针断言。

## 5. 产品面与工程成熟度

- **桌面端是 Tauri（Rust）**，复用 React dashboard 和 loopback HTTP 服务，不引入第二个状态 owner。macOS 签名更新（ad-hoc），Windows 手动。
- 三个 loopback 服务：chat_server(8767，含飞书 Lark 集成)、status_server(8765)、dash_server(只读投影)。纯本地，无云。
- CI：按 PR 影响面分诊（review_gate.py classify/verify）、ruff+mypy、TS Effect typecheck、pytest 4 shard、覆盖率 `--fail-under=19.6`（对百万行库偏低）、e2e 真实 CLI 进程死亡恢复、**mutant 测试**（故意正确性回归）、wheel/sdist 独立安装验收、打包产物零 diff 检查、desktop-updater 每 6 小时 cron。
- 发布：GitHub Releases + Tauri 签名 feed + SHA-256 hash tree manifest + artifact attestation + 双语 release notes；新能力 release body 由冒烟脚本机器校验。
- `ADOPTERS.md` 故意为空（只定义采用模式与自登记规则）。
- 它的 AGENTS.md（461 行）是给 AI 开发者的宪法：worktree 强制、pathspec-only staging、**自合并明文治理**（"自己 review/refine, then admin-bypass merge after required validation"）、First-Screen Review Gate、"Treat code volume as a cost"、控制面权威在 TS（Python 不得造第二个真相源）。

## 6. 与 AIOS/harness-cli 对比

### 我们已对齐（同族思想）
外部化状态、checkpoint/resume、bounded steps、人类 gate、完成门、证据纪律（我们的 evidence envelope + verification-before-completion ≈ 它的 settlement receipt 三件套）。ContextDB 的 offload canvas + 定向 grep/read 召回比它的事件流全量重放更省 token；rex Command → Provider 的流程治理比它的 per-宿主 skill facade 更结构化（它对 zcode 的集成就只是装一个 skill）。

### 它领先我们（按价值排序）
1. **无人值守循环**：`quota should-run` 决策门（run/wait/ask/self-repair/quiet）+ safe_bypass + cadence 阶梯退避 + unchanged-poll 停机。我们的 resume 协议是刻意 pull-based（等显式用户意图）——这是设计取向差异，但也是"200 小时叙事"的唯一实质能力差。
2. **Turn 契约协议化**：typed envelope、独立 validator 进程、CAS settlement、effect_ref 幂等扣费、failure_kind 分类。我们的证据在流程层，没到 wire 协议层。
3. **长任务可见性**：只读 dashboard/PWA/chat + 飞书。"跑 200 小时"的感知价值一半来自"随时能看"。
4. **宿主适配矩阵**：10+ 宿主各有实测契约探针；我们 orchestrate live 只有 codex-cli subagent。
5. **工程回归厚度**：525 测试文件/12 CI/mutant/打包冒烟 vs 我们的 test:scripts + mcp-server 套件。
6. **节奏经济学**：quota 占空比计费 + cadence 退避，我们没有对应物。

### 它的弱处
- 19.6% 覆盖率底线（百万行代码）、单人 bus factor、benchmark 一组已撤回、ADOPTERS 为空、探索性实验每格 1 trial、1M 行的维护成本与其 "lightweight" 自称相矛盾。

## 7. 结论

不是"我们做得不好"。同一架构思想（外置状态 + bounded loop + 证据门）两条路线：它用单人+AI 的高吞吐把控制平面做成了**产品**（营销先行、证据分级诚实），我们把同样的思想做成了**自用控制面**（流程治理更深、上下文经济更省）。差距集中在"循环经济学"（quota/cadence/lease）与产品化传播，不在核心机制。

若要借鉴，优先级：① 在现有 harness 上加 quota should-run 决策门 + safe_bypass + cadence 退避（补上无人值守档位，保留显式 resume 为默认）；② 把 evidence envelope 协议化为 turn 契约（独立 validator + settlement receipt）；③ 一个只读 status dashboard（我们已有 status/context 数据面，缺投影面）。

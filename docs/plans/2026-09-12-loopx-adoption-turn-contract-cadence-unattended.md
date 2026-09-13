# LoopX 采纳实施计划：结算门 → 节奏管理 → 无人值守档位（+小保险、dashboard、dream 治理形式化）

日期：2026-09-12。来源分析：`research/upstream/loopx-analysis.md`（LoopX v1.0.3 深读）。

## 工作项声明

- **type**: feature batch（planned）
- **targets**: `rex-harness/`（子模块）、`scripts/lib/harness/`、`scripts/lib/lifecycle/{dream,evolution}/`、`scripts/tests/`、skill 文档镜像
- **allowedWrites**: 上述 targets + `docs/plans/`、AGENTS.md/CLAUDE.md/GEMINI.md（记忆契约一行）、changelog
- **failureClass**: workspace-mutation（push/publish 仅由显式 `cap` 触发）

## 执行顺序（用户确认的因果链）

1 → 2 → 3 为因果链：没有代码级结算门，无人值守就是放大自证风险；没有节奏管理，无人值守就是烧钱机器。4、5 是顺手的小保险，6 最后做。每阶段收尾跑绿对应测试再进下一阶段。

## Phase 1 — 结算门：Turn 契约

rex-harness 子模块（先改子模块、父仓库后移指针）：

1. 新建 `src/domain/turn-contract.mjs`：typed envelope `rex.turn-result.v1`——`turnKey`（activationId+iteration）、`effectRef`（executionToken + turn payload 的 sha256，幂等键；token 单次轮换机制在 `store.mjs:85-94`）、`outcome ∈ {validated_progress, validated_completion, repair_required, replan_required, blocked}`、`failureKind ∈ {rate_limited, provider_overloaded, host_unsupported, budget_exhausted, safety_gate, ownership_gate, unknown}`、selfReport。只有 material outcome 允许结算副作用。
2. 新建 `src/application/settle-turn.mjs`（结算门）：envelope 校验 → 复用 `validate-command-evidence` → CAS 写回（`writeWorkflow` 加 expected-status 前置条件）→ settlement 行追加 append-only journal，**effectRef 重复即拒绝** → `sealCurrentCommand` 轮换 token。
3. 新建 CLI 子命令 `rex-harness verify`：独立 validator 进程，stdin 读 envelope、exit 0 才算过（executor 不得自验）。
4. harness 侧 `scripts/lib/harness/execute-turn.mjs`：turn 结果 → envelope → spawn `rex-harness verify` → 才允许 settle；validator 失败 fail-closed。
5. `solo-runtime/normalizers.mjs`：失败分类补全 `rate_limited`（现 :127 折进 runtime-error，拆出）、`provider_overloaded`、`host_unsupported`、`budget_exhausted`；探针失败 fail-closed。

## Phase 2 — 节奏管理

`scripts/lib/harness/solo-runtime/`，纯函数 + 注入式测试：

1. 新建 `should-run.mjs`：`{action: run|wait|ask|self_repair|quiet, reasonCode, nextWakeMs, cadenceClass}`；优先级 control-stop > operator_gate > quota 耗尽 > cadence 等待 > run；journal 数据驱动，无关键词猜测。
2. cadence 梯：首 turn 立即；active_work 保持基准（默认 180s）；monitor_wait ×1.5 放宽至上限；material 进展回基准；human_gate 停等。
3. 新建 `quota.mjs`（占空比额度）：24h 窗口、1 分钟 slot（1440/天）、`computeQuota` 默认 1.0；**只有结算为 material 的 turn 才扣费**；账本进 iteration journal，余额进 run summary。
4. 接线 `loop.mjs:101-138`；决策写入 run summary，`aios harness status` 投影。

## Phase 3 — 无人值守档位（显式 resume 保持默认）

1. `unattended` profile + `aios harness run --unattended`（显式 opt-in；attended 行为零变化）。
2. safe_bypass：human-gate → 恰好一个 bounded 只读 turn；代码级封印 = journal 标记 bypass + 结算门拒绝 bypass turn 的 progress/completion 声明；政策文本随 run payload 落盘。
3. unchanged-poll 停机：连续 noop 阈值（默认 3）→ quiet-shutdown；重入仅显式 `aios harness resume`。
4. 同步 `aios-long-running-harness` skill 文档（`.codex/skills` 与 `.claude/skills` 镜像）。

## Phase 4 — 小保险批

**Item 4 宿主探针**：`scripts/lib/harness/host-probes.mjs` registry，v1 覆盖 codex-cli 与 pi，接入 `evaluateDryRunReadiness`，fail-closed 报 `host_unsupported`。

**Item 5 回归厚度**：rex-harness（effectRef 重复拒绝、CAS 过期状态拒绝、verify 出入码、bypass 结算拒绝、failureKind 映射）；harness-runtime（should-run 矩阵、cadence 梯、quota 耗尽→恢复、safe_bypass 恰好一次、unchanged-poll 停机、探针 fail-closed）；一个 mutant 式定向回归钉死结算门承重。

**dream/evolution 治理形式化**（机制已在、学其形式）：

1. `dream/governance.mjs` 导出 `DREAM_PLANNING_CONTRACT`（对照 `research/upstream/loopx/loopx/dreaming.py:206-241`）：五项封印全 false（may_execute_protected_actions / may_read_private_material / may_mutate_active_state / may_append_delivery_history / may_spend_delivery_quota）；promotion_requirements 映射到本仓库词表：operator_approval（broker authorize seam）+ should_run_decision（Phase 2 门）+ write_scope_approval（allowedWrites 边界）+ boundary_scan（unsafe_content 扫描 + agent_private 排除）。
2. 契约内嵌进 proposal JSON 与 governance receipt（机器可查）；dream run 校验 proposal 必带契约。
3. `evolution/promotion.mjs` 措辞对齐（不改行为）。
4. 文档：`docs/plans/2026-07-28-context-lifecycle-v1-dream-governance-test-design.md` 权限节 + AGENTS.md 记忆契约一行（镜像 CLAUDE.md/GEMINI.md）。

## Phase 5 — 只读 status dashboard（最后）

`scripts/lib/harness/dashboard.mjs`：只读静态 HTML 投影（run summary / should-run 状态 / 结算 journal 尾部 / 探针结果 / dream proposal 计数）；`aios harness dashboard` 生成 `.aios/harness/dashboard.html`；无服务进程、零状态写入。

## 验证

- rex-harness：`cd rex-harness && npm test`。
- 根：`npm run test:scripts`（harness/dream 最低，交付前全量）。
- 冒烟：dry-run 探针预检；注入假体验证 should-run/停机。
- 子模块先提交再移父指针；skill 文档同步；versioning-by-impact 决定版本与 changelog。

## 假设清单

- 额度/退避默认值取保守档（attended 默认行为不变，unattended 严格 opt-in）。
- quota 依赖 Phase 1 结算落地，1→2 顺序不可互换。
- LoopX 词汇（should-run / cadence / effect_ref / settlement / safe_bypass / unchanged-poll）采纳为内部术语。

## 验收清单

- [x] Phase 1：重复 effectRef 被拒绝；CAS 过期状态被拒绝（state_rollback_detected 不变量）；verify CLI 对篡改 envelope 返回非零
- [x] Phase 2：quota 耗尽 → wait → 窗口释放 → run；cadence 梯按 material 进展回基准
- [x] Phase 3：unattended 下 safe_bypass 恰好一次且其 completion 声明被结算门拒绝；连续 noop 达阈值自动停机
- [x] Phase 4：codex/pi 探针 fail-closed；状态回滚重放回归钉死结算门承重；dream proposal 内嵌五项封印
- [x] Phase 5：dashboard 生成且不含任何写路径

## 交付记录（2026-09-12）

- rex-harness（子模块）：`src/domain/turn-contract.mjs`、`src/standalone/store.mjs`（settleStandaloneTurn + CAS + settlement journal）、`src/cli/{verify,settle}.mjs`、契约/域/standalone 测试 23 个新增用例。
- scripts：`solo-runtime/{should-run,cadence,quota,pacing-config}.mjs`、`loop.mjs` 门位接线与 safe_bypass、`normalizers/backoff/constants` 失败分类补全（rate-limited/provider-overloaded/host-unsupported/budget-exhausted）、`harness/turn-settlement.mjs` 桥、`harness/host-probes.mjs`、`harness/dashboard.mjs`、`aios harness dashboard` 子命令、`--unattended` 系列 flag（run/resume）、summary schema 加性 `pacing` 块、status 投影。
- dream/evolution：`DREAM_PLANNING_CONTRACT` 内嵌 proposal+receipt+写入校验；promotion.mjs 措辞对齐。
- 文档：本计划、dream governance test-design 权限节、AGENTS.md/CLAUDE.md/GEMINI.md 记忆契约一行、aios-long-running-harness skill（源 + 三镜像）。
- 测试基线：rex-harness 214 中 212 绿（2 失败为存量 workbuddy 断言）；根 test:scripts 62+29 中 59+29 绿（3 失败为存量 workflow-policy/planning-contract）。新增用例全部通过。

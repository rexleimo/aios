# 竞品优化 Review Brief — 供 Opus / GPT-5.5 审核

> 生成日期: 2026-05-22  
> 分析方法: 5 路并行 deep-dive（每路阅读 README、源码、CHANGELOG、ROADMAP）  
> 审核要求: 请逐条评估每个优化点是否准确反映了竞品的真实能力，以及移植到 AIOS 的可行性和优先级是否合理

---

## 审核清单

对每个优化点，请回答 3 个问题：
1. **真实性**: 竞品确实有这个能力吗？DeepSeek 的分析是否有误？
2. **移植性**: 这个能力在 AIOS 的架构下是否可移植？有什么关键阻碍？
3. **优先级**: P0/P1/P2 的评级是否合理？

---

## 一、Harness（长任务编排）

### #1 Iteration Notes（迭代笔记）

**来源**: gnhf (kunchenguid/gnhf, 1,741★, TypeScript)

**竞品实现**: 
- `src/core/orchestrator.ts` (~340 行核心循环) 每轮执行后 appends `notes.md`:
  ```markdown
  ### Iteration 3
  **Summary:** 简化了 auth.ts 中的分支逻辑
  **Changes:** 提取 validation 函数, 用 early return 替代嵌套
  **Learnings:** auth flow 的过期 token 存在未文档化的边界情况
  ```
- 下轮 agent 先读 `notes.md` 了解前因后果
- 每次成功 iteration git commit，失败 reset --hard
- Web/node_modules 自动 gitignore

**AIOS 移植**: harness checkpoint 从 JSON schema 改为轻量 notes.md append 模式

**问题**: gnhf 的核心循环只有 ~340 行，它的 iteration notes 模式是否真的足以替代 AIOS 当前的 ContextDB checkpoint JSON？gnhf 是否有处理多文件变更、跨 agent 笔记合并的场景？

---

### #2 Dry-Run Readiness 裁定

**来源**: OpenHarness (HKUDS/OpenHarness, 12,917★, Python)

**竞品实现**:
- `oh --dry-run` 静态预检，不调用模型、不执行工具、不连接 MCP
- 解析：配置合并 → auth 状态检查 → prompt 组装 → 命令解析 → 工具列表 + schema → MCP 配置问题检测
- 三档输出: `ready` / `warning` / `blocked`，含 `next_actions` 具体修复指令

**AIOS 移植**: `harness run --dry-run` 预检层

**问题**: OpenHarness 的 dry-run 是静态检查还是真的验证了运行时条件？AIOS 的配置分散在 `.aios/` 多个目录中，dry-run 需要检查哪些维度才能达到有效预检？

---

### #3 Auto-Compaction 自动压缩

**来源**: OpenHarness (v0.1.6) + Letta/MemGPT

**竞品实现**:
- OpenHarness: token 阈值触发，压缩对话历史为摘要，保留任务状态/当前目标/开放文件/worktree 状态
- Letta: 90% 上下文阈值触发，agent 生成 self-summary → 写入 core memory block → 截断旧消息
- 触发机制: `engine/cost_tracker.py` + `engine/messages.py` 监控 token 用量（OpenHarness）

**AIOS 移植**: ContextDB `context:pack` 自动化触发

**问题**: Letta 的 90% 阈值是 agent 自主调用的函数，不是系统 hook。AIOS harness 是外部循环驱动，这种"agent 自主管理"的模式在 AIOS 架构下是否适用？OpenHarness 的 compaction 保留"任务状态"具体保留了哪些字段？

---

### #4 指数退避（硬错误 vs 自报失败）

**来源**: gnhf

**竞品实现**:
- Agent 崩溃/进程错误 → 60s × 2^n 退避
- Agent 自报 `success=false` → 不退避，继续下一轮（agent 尝试了但没成功是健康行为）
- PermanentAgentError（低余额/auth 失败）→ 立即中止 + 输出日志路径
- 连续失败 ≥3 → abort

**AIOS 移植**: harness watchdog 增强

**问题**: gnhf 是如何区分"agent 自报 failure"和"进程 crash"的？这个区分在 AIOS 的 Claude Code/Codex/OpenCode adapter 中是否都可行？

---

### #5 多信号 Stall 检测

**来源**: gnhf

**竞品实现**:
- 连续 no-op 迭代 → 计为失败
- token 预算耗尽 → 通过 AbortController 中止当前迭代
- 自然语言 `--stop-when` 条件 → agent 设 `should_fully_stop=true`
- permanent error → 立即 abort

**AIOS 移植**: 扩展 Todo Enforcer idle detection（AIOS 已有基础）

**问题**: "no-op 检测"如何定义？gnhf 用 git diff 判断有无文件变更还是其他方式？`--stop-when` 是 agent JSON 输出中的一个字段，这个机制在 Claude Code 的 prompt 模式下是否可靠？

---

## 二、跨 CLI

### #8 Runtime 抽象接口规范化

**来源**: overstory (jayminwest/overstory, 1,302★, TypeScript, 维护模式已移交 Warren)

**竞品实现**:
- `src/runtimes/types.ts` 定义 `AgentRuntime` interface（~50 行）:
  ```typescript
  interface AgentRuntime {
    buildSpawnCommand(): string[]
    buildPrintCommand(): string
    deployConfig(): Promise<void>
    detectReady(): Promise<boolean>
    parseTranscript(transcript: string): AgentTurn[]
    getTranscriptDir(): string
    buildEnv(): Record<string, string>
    // 可选 headless 模式
    buildDirectSpawn?(): Promise<SpawnResult>
    parseEvents?(events: string): AgentEvent[]
    connect?(): Promise<RPCConnection>
  }
  ```
- 11 个 adapter: Claude Code, Codex, Copilot, Cursor, Gemini, Aider, Goose, Amp, OpenCode, Pi, Sapling
- 每 CLI 一个 adapter 文件（`src/runtimes/adapters/claude-code.ts` 等）

**AIOS 移植**: 规范化 `scripts/lib/` 现有的 Claude/Codex/Gemini/OpenCode 包装器

**问题**: overstory 已经进入维护模式，这个 interface 是否经过了足够的生产验证？AIOS 的 adapter 目前是脚本级别（shell wrapper），抽象成 TypeScript interface 需要哪些架构变更？

---

### #9 Headless NDJSON 事件流

**来源**: overstory

**竞品实现**:
- `turn-runner.ts` spawn-per-turn 模式，每 turn 启动新 agent 进程
- agent stdout 输出 NDJSON 行，解析为类型化 `AgentEvent` 对象
- 支持结构化回放和事件驱动 UI

**AIOS 移植**: harness 输出从文本日志 → 结构化 NDJSON

**问题**: AIOS 的 harness 目前用 `ctx-agent.mjs` 单进程驱动。改 spawn-per-turn 模式对性能有多大影响？NDJSON 解析是否与各 CLI 的 JSON 输出格式兼容？

---

### #10 JSON 输出 Schema 强制 + 鲁棒提取

**来源**: gnhf

**竞品实现**:
- `agents/json-extract.ts` 处理 agent 把 JSON 包裹在 markdown code fence 中
- `agents/types.ts` 动态构建 strict JSON schema
- gnhf 给自己写的 SKILL.md 明确要求 agent 输出特定 JSON 格式

**AIOS 移植**: harness 结果解析层

**问题**: AIOS harness 要求 agent 输出的格式是什么？当前解析失败率如何？gnhf 的 JSON extraction 策略是否值得直接移植？

---

## 三、多 Agent 交流

### #12 SQLite WAL 邮件总线

**来源**: overstory

**竞品实现**:
- 自建 SQLite WAL 模式邮件系统，~1-5ms/query
- 8 种类型化协议消息: `worker_done`, `merge_ready`, `merged`, `merge_failed`, `escalation`, `health_check`, `dispatch`, `assign`
- 每条消息: `from`, `to`, `subject`, `body`, `type`, `priority` (low/normal/high/urgent), `payload` (JSON)
- 广播支持: `@all`, `@builders` 等组地址
- FIFO merge queue（SQLite 实现）+ sentinel-file lock 防并发 merge
- CLI: `ov mail send/check/list/read/reply/purge`

**AIOS 移植**: `aios team` 内部通信替代当前进程级 IPC

**问题**: AIOS 当前 `aios team` 启动多个独立子进程，它们之间的通信是通过什么机制？overstory 的 SQLite mail bus 是否过度设计（对于 AIOS 通常 2-3 agent 的规模）？是否需要文件锁和并发控制？

---

### #13 Agent Mailbox 文件系统

**来源**: oh-my-openagent (code-yeongyu/oh-my-openagent, 58,967★, TypeScript, v4.3.0)

**竞品实现**:
- Team Mode v4.0: 1 leader + 最多 8 member 并行
- 存储布局 `~/.omo/runtime/{teamRunId}/tasks/`
- 每 UUID 原子文件，投递中预留 `.delivering-*.json` 防重复
- 已处理消息目录，10 分钟崩溃恢复 TTL
- 每成员收件箱: 消息体 ≤32KB，未读 ≤256KB，每轮 ≤10000 条

**AIOS 移植**: 参考 mailbox 文件系统设计 AIOS team 通信

**问题**: oh-my-openagent 的 Team Mode v4.0 默认为关闭状态，它的 mailbox 系统在生产中是否经过了足够验证？原子文件投递预留机制（.delivering-*.json）的具体实现细节？

---

## 四、记忆系统

### #15 零 LLM 检索 + 多信号融合

**来源**: mem0 (mem0ai/mem0, 56,402★, Python, v0.2.7 CLI)

**竞品实现**:
- V3 检索管道完全不调用 LLM: 向量语义搜索 → BM25 关键词 → 实体匹配 → 三信号融合评分 → 阈值过滤 → top-K
- BM25 仅作为 ranking boost，不作为 recall expander（防止噪声）
- 评分公式: `combined = (semantic + bm25 + entity_boost) / max`，自适应可用信号
- 性能: LongMemEval 94.8, BEAM(1M) 64.1, 平均 6.7-7.0K token 消耗, p50 延迟 <1s
- 优雅降级: 无 spaCy → 无实体提取；无 fastembed → 无 BM25；始终有语义搜索 baseline

**AIOS 移植**: ContextDB 增加 `context:search` 命令实现混合检索

**问题**: AIOS ContextDB 当前是 JSON 文件存储无向量索引，要引入 embedding 需要加什么存储后端？mem0 依赖 22 种向量数据库，AIOS 是否应该选 SQLite + sqlite-vec 还是需要外部服务？

---

### #16 工具日志 Mermaid 符号化压缩

**来源**: TencentDB-Agent-Memory (Tencent/TencentDB-Agent-Memory, 3,789★, TypeScript, v0.3.5)

**竞品实现**:
- 管道: 工具日志(数十万 token) → offload 到 `refs/*.md` → 提取 Mermaid 图(canvas) → 仅注入几百 token Mermaid 到上下文
- 需要细节时 agent 用 node_id grep 原始文件
- 三档触发阈值: `mildOffloadRatio=0.5`(50%窗口), `aggressiveCompressRatio=0.85`(85%), `mmdMaxTokenRatio=0.2`(Mermaid 最多占 20%)
- 实测: WideSearch 成功率 +51.52%, token 节省 61.38%; SWE-bench 成功率 +9.93%, token 节省 33.09%
- Mermaid 语法 LLM 可解析、人类可读、信息密度极高

**AIOS 移植**: 已有 `offload canvas backfill` (commit 948e8dc)，需从手动 → 自动化

**问题**: AIOS 的 offload canvas backfill 目前实现了多少？是手动触发还是自动？Mermaid 状态图的提取质量如何保证？是否依赖 LLM 来提取还是规则引擎？

---

### #17 L0→L3 语义金字塔

**来源**: TencentDB-Agent-Memory

**竞品实现**:
```
L3 Persona (persona.md)        ← 几百 token, 蒸馏自 L2
L2 Scenario (scene blocks)     ← Markdown, 聚合自 L1
L1 Atom (atomic facts)         ← JSONL + vectors.db, 提取自 L0
L0 Conversation (raw)          ← JSONL 全量存储
```
- 触发器: turn count (每 N 轮) + idle timeout (600s)
- L1→L2 延迟: v0.3.5 从 90s 降至 10s
- Warmup: 新会话从 turn 1 触发，指数退避 1→2→4 直到 everyNConversations
- 完整可追溯: Persona → Scenario → Atom → Conversation 逐层 drill-down
- PersonaMem 准确率: 48% → 76%

**AIOS 移植**: ContextDB 从单层 → 分层，增加自动提取

**问题**: AIOS ContextDB 已经是 L0/L1/L2 tiered loading（5月10日实现），但是否有自动提取和聚合？TencentDB 的 4 层金字塔 vs AIOS 的 3 层 tiered loading 核心区别是什么？

---

### #18 L0/L1/L2 分层上下文

**来源**: OpenViking (volcengine/OpenViking, 24,470★, Python, v0.3.18)

**竞品实现**:
- 所有内容预处理为 3 层:
  - L0 `.abstract.md` ~100 token → 向量搜索快速过滤
  - L1 `.overview.md` ~2K token → 重排 + agent 决策
  - L2 原始文件 → 按需 `read()` 取全量
- 生成方式: SemanticProcessor 自底向上遍历，子目录 L0 聚合为父目录 L1
- `max_input_tokens=4096` 控制每 item embedding 文本上限

**AIOS 移植**: 对齐 AIOS 已有的 tiered loading

**问题**: AIOS 的 L0(2K)/L1(5K)/L2(10K) token budget 与 OpenViking 的 ~100/2K/unbounded 完全不同。哪个更合理？OpenViking 的自动生成策略是否适合 AIOS 的文件结构？

---

## 五、需要审核的 P0 优先级判定

以下是当前排定的 P0 7 项（4 域中），请逐项审核优先级是否合理:

| # | 优化点 | 域 | P0 理由 |
|---|--------|---|---------|
| 1 | Iteration Notes | Harness | 10x 轻于 ContextDB checkpoint |
| 2 | Dry-Run Readiness | Harness | 消除 setup 失败 |
| 3 | Auto-Compaction | Harness | 多天连续运行的基础 |
| 8 | Runtime 抽象 | 跨CLI | 已有多 adapter 雏形，规范化成本低 |
| 12 | SQLite Mail Bus | 多Agent | `aios team` 目前无结构化消息 |
| 15 | 零 LLM 检索 | 记忆 | ContextDB 当前无自动检索 |
| 16 | Mermaid 压缩 | 记忆 | 已有 offload 基础，扩展成本低 |
| 17 | L0→L3 金字塔 | 记忆 | ContextDB tiered loading 只有 load 没有 extract |

---

## 方法论说明

本次分析通过以下步骤完成:
1. 爬取 14 个竞品仓库的 GitHub API 最新元数据（stars/releases/push 时间）
2. 5 路并行 deep-dive agent（每路由 1-4 个竞品）
3. 每路: 阅读 README → 查阅源码目录结构 → 抓取 CHANGELOG/ROADMAP → 交叉验证
4. 汇总去重 → 按 4 域分类 → P0/P1/P2 评级

请注意: deep-dive agent 可能存在的分析偏差包括：
- 对 TypeScript 源码的推断基于目录结构和公开文档（未实际运行）
- 竞品的"实测数据"来自其 README 声称，未经独立验证
- 某些竞品的最新版本功能可能尚未稳定

请 Opus / GPT-5.5 对以上偏差做补充或纠正。

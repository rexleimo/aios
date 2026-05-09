---
title: debug-hub
description: MCP 原生调试日志服务，让 coding agent 能够查询自己的运行时日志并自我诊断错误。
---

# debug-hub

> 让 coding agent 学会自己查日志。

debug-hub 是专为 coding agent 设计的 MCP 原生调试日志服务。它将日志和调用链暴露为 agent 可直接调用的 MCP 工具——这样它们就可以 `search_logs`、`get_trace` 和 `get_stats`，而无需你去 grep 终端输出。

[阅读博客文章](/blog/zh/2026-05-debug-hub-mcp/){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="blog_post" }
[快速开始](#quick-start){ .md-button data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="quick_start" }

---

## 为什么需要 debug-hub

当 coding agent 遇到错误循环、决策停滞或产生意外输出时，调试流程总是**人类优先**的：

1. 你注意到出问题了
2. 你翻阅终端历史记录或打开日志文件
3. 你手动关联时间戳、错误信息和调用链跨度
4. 你把相关内容粘贴回 agent 的上下文
5. agent 终于获得足够的信号来恢复

这种模式在长时间运行的 harness 任务、过夜运行和无人值守的多 agent 编排中就会失效。

**核心洞察**：agent 应该能够自检其执行轨迹。它们已经有工具访问权限（MCP）。它们只需要一个可查询的运行时状态接口。

---

## 核心功能

<div class="feature-grid">
  <div class="feature-card feature-card--debug">
    <div class="feature-card__icon">🔧</div>
    <div class="feature-card__title">Agent 可用的 MCP 工具</div>
    <div class="feature-card__desc">
      日志/Trace 工具加上 <code>start_session</code>、<code>record_event</code>、<code>timeline</code>、<code>health</code>、<code>compact_context</code> — agent 可以查询运行时证据，而不只是日志。
    </div>
  </div>
  <div class="feature-card feature-card--tool">
    <div class="feature-card__icon">📦</div>
    <div class="feature-card__title">三种 SDK</div>
    <div class="feature-card__desc">
      Node.js、Browser 和 Go — 跨所有运行时的一致 API 模式。
    </div>
  </div>
  <div class="feature-card feature-card--memory">
    <div class="feature-card__icon">📁</div>
    <div class="feature-card__title">零依赖</div>
    <div class="feature-card__desc">
      基于 <code>~/.debug-hub/</code> 的文件存储 — 可直接用 <code>cat</code>/<code>grep</code> 读取。
    </div>
  </div>
  <div class="feature-card feature-card--workflow">
    <div class="feature-card__icon">🖥️</div>
    <div class="feature-card__title">内嵌 Web UI</div>
    <div class="feature-card__desc">
      暗色主题仪表盘，包含日志搜索、调用链查看器和 SSE 实时推送。
    </div>
  </div>
</div>

---

## 快速开始 {#quick-start}

```bash
cd packages/debug-hub
npm install
npm run dev
```

- **HTTP API + Web UI**: http://localhost:39200
- **MCP**: stdio 模式（在你的 agent 的 MCP 设置中配置）

### 发送测试日志

```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "1",
    "timestamp": 1714500000000,
    "level": "info",
    "message": "hello from debug-hub",
    "source": {},
    "trace": {"traceId": "t1", "spanId": "s1"},
    "sdk": {"name": "test", "version": "0.2.0", "runtime": "node"}
  }'
```

然后打开 `http://localhost:39200` 即可在 Dashboard 中查看。

---

## SDK 使用

### Node.js

```typescript
import { DebugHub } from '@debug-hub/node';

const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search', args: { query: '...' } });

const trace = debug.startTrace('agent-turn');
const span = trace.span('llm-call');
span.info('Prompt sent', { model: 'claude-opus-4-7' });
span.end();
trace.end();
```

### Browser

```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

### Go

```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

---

## MCP 工具参考

| 工具 | 描述 |
|------|-------------|
| `debug_hub.list_traces` | 列出最近的执行调用链，支持过滤 |
| `debug_hub.get_trace` | 获取特定调用链的完整跨度树 |
| `debug_hub.search_logs` | 按关键词、级别、时间范围、模块或 traceId 搜索日志 |
| `debug_hub.get_stats` | 聚合计数、错误摘要、级别分布 |
| `debug_hub.clear_logs` | 根据保留规则清理旧日志 |
| `debug_hub.start_session` | 创建带目标和工作区元数据的 agent 调试会话 |
| `debug_hub.record_event` | 记录 hypothesis、tool call、artifact、verification note 等结构化证据 |
| `debug_hub.get_session` | 读取会话及其证据事件 |
| `debug_hub.timeline` | 返回紧凑的时间线证据流 |
| `debug_hub.health` | 返回采集/存储健康状态和 schema version |
| `debug_hub.compact_context` | 为 agent 恢复/交接生成受限上下文包 |

### 自我诊断示例

一个遇到重复错误的 agent 现在可以：

1. 调用 `search_logs`，参数为 `{ level: "error", since: <5 分钟前> }`
2. 获取准确的错误信息和它们的 trace ID
3. 在相关调用链上调用 `get_trace` 查看完整的跨度树
4. 自我诊断其流水线中哪个步骤失败了
5. 无需人工干预即可自我纠正

---

## 架构

debug-hub 是一个 Node.js 二进制文件，整合了四个组件：

| 组件 | 作用 |
|-----------|------|
| **HTTP API** | 接收来自 SDK 的日志，提供搜索/统计端点 |
| **MCP Server** | 为 coding agent 暴露日志/Trace、会话、事件、健康、时间线和紧凑上下文工具 |
| **内嵌 Web UI** | 暗色主题仪表盘，包含日志搜索、调用链查看器、SSE 实时推送 |
| **文件存储** | `~/.debug-hub/` 下的 JSONL 文件 — 可直接读取 |

### 设计决策

**无数据库依赖。** 存储是磁盘上的 JSONL 文件。这意味着：
- `npm install` 之外零配置
- Agent 可以绕过 API 直接读取文件
- 无守护进程、无 Docker、无连接字符串

**MCP 优先，HTTP 其次。** MCP 工具定义与 HTTP API 共享同一存储层并协同设计。

**Dashboard 使用 SSE。** 新日志条目通过 Server-Sent Events 广播 — 无 WebSocket 复杂性，无轮询开销。

---

## 使用场景

### 自我诊断错误循环

当 agent 陷入重试循环时，它可以查询自己的近期错误日志、识别模式，并调整策略 — 全程无需叫醒你。

### 长时间运行任务监控

过夜的 harness 运行、数据处理作业或训练流水线可以记录结构化的调用链。如果出了问题，第二天早上的诊断 agent 可以从调用链历史中拉取确切的失败点。

### 多 Agent 执行追踪

分布式编排器/工作器模式可以跨 agent 边界关联调用链，为你提供复杂多步骤工作流的统一视图。

---

## 路线图

debug-hub 当前为 0.2.0 版本。近期新增自动 Trace 物化、agent 调试会话、结构化证据事件、存储健康状态和紧凑上下文包。路线图包括：

- **Python SDK** — 面向更广泛的 AI/ML agent 生态系统
- **多 agent 关联** — 编排器/工作器模式的跨 agent 调用链链接
- **持久告警规则** — agent 可配置的监控条件，在日志模式触发时告警

---

## 资源

- **深度博客文章**: [debug-hub：MCP 原生调试日志服务](/blog/zh/2026-05-debug-hub-mcp/)
- **源代码**: rex-ai-boot 单体仓库中的 `packages/debug-hub`
- **系统要求**: Node.js ≥ 22

---

## 相关功能

- [单 Agent 夜跑](solo-harness.md) — 长时间运行的单 agent 任务与日志
- [多 Agent 实战](team-ops.md) — 多 agent 协作与协调
- [故障排查](troubleshooting.md) — 常规调试和诊断

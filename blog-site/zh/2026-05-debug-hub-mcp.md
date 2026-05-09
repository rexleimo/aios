---
title: "debug-hub：让 Coding Agent 自己查日志的 MCP 原生调试服务"
description: "推出 debug-hub 0.1.0 — 专为 coding agent 设计的轻量 MCP 原生 debug 日志服务，提供 Node.js / Browser / Go 三种 SDK，内嵌 Web UI，文件存储可直接 grep。"
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "可观测性", "Node.js", "Go", "AIOS"]
---

# debug-hub：让 Coding Agent 自己查日志的 MCP 原生调试服务

每个 coding agent 都在产生日志。但出问题时，agent 自己没法查这些日志——它不能 grep 你的终端输出、不能解析 JSONL 文件、不能跨 span 关联错误。最终是你，人类操作者，被迫停下来当侦探。

**debug-hub** 改变了这个局面。它是一个从底层为 coding agent 设计的 debug 日志收集服务——把日志和 trace 暴露为 MCP 工具，让 agent 可以直接查询。

## 问题：Agent 看不见自己的运行时

当 coding agent 陷入错误循环、决策卡壳、或输出异常时，调试流程永远是"人先上"：

1. 你发现不对劲
2. 你翻终端历史或打开日志文件
3. 你手动关联时间戳、错误信息和调用链
4. 你把相关片段贴回 agent 的上下文
5. Agent 终于拿到足够信号，恢复执行

短会话还能忍。长任务、过夜跑、多 agent 协同——没人盯着的场景下，这套流程直接崩盘。

核心洞察：**agent 应该能内省自己的执行轨迹**。它们已经有工具调用能力（MCP），已经会推理错误原因。缺的只是自己运行时状态的可查询入口。

## debug-hub 提供了什么

debug-hub 是一个 Node.js 二进制，一个进程打包了四个组件：

| 组件 | 职责 |
|------|------|
| **HTTP API** | 接收 SDK 上报的日志，提供搜索/统计接口 |
| **MCP Server** | 暴露 5 个工具（`list_traces`、`get_trace`、`search_logs`、`get_stats`、`clear_logs`），直接给 coding agent 调用 |
| **内嵌 Web UI** | 暗色主题 Dashboard，支持日志搜索、Trace 树查看、SSE 实时推送 |
| **文件存储** | `~/.debug-hub/` 下的 JSONL 文件——agent 可以直接 `cat`/`grep` 读取 |

### 三种 SDK，一致的 API

**Node.js**
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

**Browser**
```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

**Go**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

### Agent 可用的 MCP 工具

把 debug-hub 加到 agent 的 MCP 配置中，它就多了 5 个工具：

```
debug_hub.list_traces   — 列出最近的执行 Trace
debug_hub.get_trace     — 获取指定 Trace 的完整 Span 树
debug_hub.search_logs   — 按关键字、级别、时间范围、模块、traceId 搜索
debug_hub.get_stats     — 聚合计数、错误摘要、级别分布
debug_hub.clear_logs    — 清理旧日志
```

一个在反复报错的 agent 现在可以：

1. 调用 `search_logs`，参数 `{ level: "error", since: <5分钟前> }`
2. 拿到精确的错误信息和 traceId
3. 调用 `get_trace` 查看完整的 span 树
4. 自己诊断 pipeline 中哪一步出了问题
5. 不依赖人类介入，自我纠错

## 几个值得注意的设计选择

**零数据库依赖。** 存储就是 `~/.debug-hub/` 下的 JSONL 文件。意味着：
- 不需要数据库、不需要 Docker、不需要连接字符串
- Agent 可以绕过 API，直接用 `cat`/`grep` 读文件
- 人类操作者也能用熟悉的命令行工具排查

**MCP 优先，HTTP 其次。** MCP 工具定义不是事后绑在 HTTP API 上的附庸——它们共享同一存储层，是一起设计的。HTTP API 服务于 SDK 上报告和 Web UI；MCP 接口才是 agent 实际查询的入口。

**SSE 驱动 Dashboard。** 新日志通过 Server-Sent Events 推送到 Web UI——不需要 WebSocket，没有轮询开销。

## 快速开始

```bash
cd packages/debug-hub
npm install
npm run dev
# HTTP API + Web UI: http://localhost:39200
# MCP: stdio 模式（在 agent 的 MCP 配置中添加即可）
```

发一条测试日志：
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello from debug-hub","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"0.1.0","runtime":"node"}}'
```

打开 `http://localhost:39200` 就能在 Dashboard 看到。

## 0.1.0 以来的更新

**v0.2 (2026-05-09):** 自动 Trace 物化（防抖合并）、agent 调试会话（`start_session`、`record_event`、`get_session`）、结构化证据事件、紧凑时间线和上下文包、`/api/health`、输入校验、路径穿越防护。

**v0.3 (2026-05-09):** 注入追踪与自动清理。新增 MCP 工具：`instrument`、`list_instruments`、`cleanup_instruments`。标记约定 `DH:<sessionId>` 实现零依赖调试代码注入——agent 注入一行 `__dh` reporter，每条调试调用标记会话 ID，修完 bug 后 `cleanup_instruments` 一键清理。双模清理（显式通过 instrument 记录，回退通过 workspace grep），支持 `dryRun` 预览。

## 路线图

- **Python SDK** — 覆盖更广的 AI/ML agent 生态
- **Trace 压缩** — 把长 trace 总结为 agent 友好的摘要，不占满 context window
- **多 Agent 关联** — 跨 agent trace 链接，匹配 orchestrator/worker 模式
- **持久告警规则** — agent 可配置的 watch 条件，匹配日志模式时触发

## 试试看

debug-hub 在 [rex-ai-boot](https://github.com/rexleimo/rex-cli) monorepo 的 `packages/debug-hub` 目录下，需要 Node.js ≥ 22。

如果你在构建 coding agent、harness runner、或 MCP server——给你的 agent 一个自己 debug 自己的能力。

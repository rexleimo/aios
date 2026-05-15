---
title: "debug-hub：当你的 Agent 能自己调试 Bug，你就能睡个好觉"
description: "如果你的 coding agent 能自己看错误日志、自己修 bug 而不用叫醒你呢？这就是 debug-hub。"
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "可观测性"]
---

# debug-hub：当你的 Agent 能自己调试 Bug，你就能睡个好觉

想象这个场景：凌晨 3 点，你的过夜 Agent 运行碰到了错误。在过去，你会醒来面对一个崩溃的状态，然后花一上午翻日志。

**如果 agent 能自己调试呢？**

这正是 debug-hub 做的事。它让你的 agent 拥有搜索自己日志、追踪执行路径、找出问题根因的能力——全部自主完成，不需要你。

## 问题：Agent 是瞎子

当 agent 遇到错误时，它看不到自己的日志。它不能 `grep` 终端输出，不能关联时间戳。调试流程永远是：

1. **你**发现不对劲
2. **你**翻日志
3. **你**找到错误，贴回给 agent
4. Agent 终于理解了

短会话还行。但过夜运行、多 agent 任务、长 harness 作业——没有人类盯着。Agent 就……静默失败。

## 解决方案：给 Agent 的工具

debug-hub 通过 MCP 暴露日志工具——MCP 就是你的 agent 已经在用的工具协议。你的 agent 获得新能力：

| 工具 | Agent 能做什么 |
|---|---|
| `search_logs` | "显示最近 5 分钟的所有错误" |
| `get_trace` | "显示这个错误的完整执行路径" |
| `get_stats` | "总共有多少错误？" |
| `start_session` | "我要开始调试了，跟踪它" |
| `cleanup_instruments` | "删掉我的调试代码，bug 修好了" |

### 一个自我调试的例子

一个陷入重试循环的 agent 现在可以：

1. 搜索自己最近的错误日志
2. 找到精确的错误信息和对应的 trace ID
3. 拉取完整的执行链路，看哪一步失败了
4. 诊断问题并修复它
5. 全程不用叫醒你

## 里面有什么

debug-hub 是一个 Node.js 进程，所有功能都内置：

- **HTTP API** — 从你的代码接收日志
- **MCP Server** — 为 agent 暴露工具
- **Web UI** — 暗色主题的仪表盘，给人看
- **文件存储** — `~/.debug-hub/` 下的简单 JSONL 文件

不需要数据库。不需要 Docker。不需要连接字符串。`npm install` 就能跑。

### 三种 SDK

在任何运行时使用相同的 API：

**Node.js:**
```typescript
import { DebugHub } from '@debug-hub/node';
const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search' });
```

**Browser:**
```typescript
import { DebugHub } from '@debug-hub/browser';
const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat' });
```

**Go:**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
```

## 快速开始

```bash
cd packages/debug-hub
npm install
npm run dev
# → HTTP API + Web UI: http://localhost:39200
# → MCP: stdio 模式
```

发一条测试日志：
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"sdk":{"name":"test","version":"0.3.0","runtime":"node"}}'
```

打开 http://localhost:39200 在仪表盘中查看。

## 更大的图景

debug-hub 是 RexCLI **可观测性层**的一部分。它与以下工具协同工作：

- [ContextDB](https://cli.rexai.top/contextdb/) — 跨会话的记忆
- [Solo Harness](https://cli.rexai.top/solo-harness/) — 可自诊断的过夜运行
- [Agent Team](https://cli.rexai.top/team-ops/) — 多 agent 链路追踪

当你的 agent 能自己调试，你就能信任它们跑更久、处理更复杂的任务、从错误中恢复——这一切都不需要你时刻关注。

---

*debug-hub 目前版本 v0.3.0，是 [RexCLI](https://cli.rexai.top) 的一部分。试试看，给你的 agent 自我反思的能力。*

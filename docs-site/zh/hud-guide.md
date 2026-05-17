---
title: HUD 用户指南
description: 使用 HUD（Heads-Up Display）监控 agent 会话的完整指南。
---

# HUD 用户指南

HUD（Heads-Up Display）提供 agent 会话状态、dispatch 结果和改进机会的实时可见性。

## 何时使用 HUD

- **长运行任务**：监控进度而不打断 agent
- **调试失败**：查看 quality-gate 结果和 hindsight 分析
- **技能改进**：发现和应用 skill candidate 补丁
- **团队协作**：跟踪多个并发会话

## HUD 模式

### Minimal 模式

最适合长运行会话的 watch 模式：
- 仅显示基本状态
- 快速刷新（1 秒数据轮询）
- 自适应间隔以减少资源使用

```bash
aios hud --watch --preset minimal --fast
```

### Compact 模式

终端友好的摘要：
- 会话目标
- Dispatch 摘要
- Quality-gate 状态

```bash
aios hud --preset compact
```

### Focused 模式（默认）

大多数用例的平衡详情：
- 所有 compact 信息
- 最近 dispatch artifacts
- Skill candidate hints

```bash
aios hud --preset focused
```

### Full 模式

完整诊断：
- 所有 focused 信息
- 完整 hindsight 分析
- Quality-gate 详情
- Fix hints 和推荐

```bash
aios hud --preset full
```

## 基本用法

### 查看当前会话

```bash
# 默认 focused 视图
aios hud

# 指定 provider
aios hud --provider claude
aios hud --provider gemini
```

### Watch 模式

```bash
# 持续监控（1 秒刷新）
aios hud --watch

# 自定义间隔（毫秒）
aios hud --watch --interval-ms 2000

# 带自适应间隔的快速模式
aios hud --watch --fast
```

### 指定会话

```bash
# 按会话 ID
aios hud --session <session-id>

# 从最近历史
aios hud --session $(aios team history --json | jq -r '.[0].sessionId')
```

### JSON 输出

```bash
# 机器可读输出
aios hud --json

# 与 jq 结合过滤
aios hud --json | jq '.selection.qualityGate'
```

## Skill Candidate 功能

### 查看 Skill Candidates

当会话有改进建议时，skill candidates 会自动显示：

```bash
# 在 HUD 下方显示 candidates
aios hud --show-skill-candidates

# 详情视图（独立 candidate 列表）
aios hud --show-skill-candidates --skill-candidate-view detail

# 限制 candidate 数量（1-20）
aios hud --show-skill-candidates --skill-candidate-limit 10
```

### Skill Candidate 视图模式

**Inline（默认）**：Candidates 显示在 HUD 下方

```
═══════════════════════════════════════
HUD 状态
═══════════════════════════════════════
Session: abc123
Goal: 实现用户认证
Status: running | dispatch=ok | quality=ok
...

───────────────────────────────────────
Skill Candidates (3)
───────────────────────────────────────
[1] skill-candidate-001
    Scope: authentication
    Failure: token-validation-edge-case
    Lessons: 2
    Patch: 为过期令牌添加重试逻辑

[2] skill-candidate-002
    ...
```

**Detail**：仅显示 candidates（HUD 隐藏）

```bash
aios hud --show-skill-candidates --skill-candidate-view detail
```

### 导出补丁模板

将 skill candidates 导出为补丁模板 artifacts：

```bash
# 导出到默认位置
aios hud --export-skill-candidate-patch-template

# 使用特定 draft ID 过滤导出
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>

# 使用自定义 candidate 限制导出
aios hud --export-skill-candidate-patch-template --skill-candidate-limit 5
```

**输出位置**：`.aios/context-db/sessions/<session-id>/artifacts/skill-candidate-patch-template-<timestamp>.md`

### 按 Draft ID 过滤

```bash
# 仅显示特定 draft 的 candidates
aios hud --show-skill-candidates --draft-id <draft-id>

# 导出过滤的 candidates
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>
```

## Quality-Gate 集成

### 查看 Quality-Gate 状态

HUD 自动显示 quality-gate 结果：

```bash
# 完整视图包含 quality 详情
aios hud --preset full

# 编程访问的 JSON 输出
aios hud --json | jq '.selection.qualityGate'
```

### 按 Quality 分类过滤

```bash
# HUD 不直接支持 - 使用 team history
aios team history --quality-category clarity --limit 5
```

## 性能调优

### Fast Watch 模式

为长运行 watch 会话优化：

```bash
# Minimal preset + fast mode = 最低开销
aios hud --watch --preset minimal --fast

# 数据刷新：1 秒（最小）
# 渲染间隔：自适应（基于活动 1 秒 -10 秒）
```

### 自定义刷新间隔

```bash
# 后台监控的较慢刷新
aios hud --watch --interval-ms 5000

# 自适应间隔（基于会话活动自动调整）
aios hud --watch --adaptive-interval
```

## Watch 模式最佳实践

### 终端管理

```bash
# 在 tmux 窗格中运行以持久监控
tmux new-session -a -s aios-hud 'aios hud --watch'

# 分割终端：agent 在上，HUD 在下
tmux split-window -v
# 上窗格：运行 agent
# 下窗格：aios hud --watch --preset minimal
```

### 通知集成

```bash
# quality-gate 失败时告警（以 terminal-notifier 为例）
aios hud --watch --json | while read line; do
  echo "$line" | jq -r '.selection.qualityGate.outcome' | grep -q failed && \
    osascript -e 'display notification "Quality gate failed!" with title "AIOS HUD"'
done
```

### 日志关联

```bash
# 将 HUD 时间戳与 agent 日志关联
aios hud --watch | ts '[%Y-%m-%d %H:%M:%S] HUD: '
```

## 故障排查

### HUD 显示过时数据

```bash
# 通过重启 watch 强制刷新
# HUD 为性能缓存数据

# 检查数据刷新间隔
aios hud --watch --interval-ms 500
```

### 未显示 Skill Candidates

可能原因：
- 未选择会话（使用 `--session`）
- 会话没有失败的 quality-gates
- 会话通过所有 quality 检查
- Learn-eval 尚未运行

```bash
# 验证会话有 quality-gate 失败
aios hud --json | jq '.selection.qualityGate'

# 检查 learn-eval 是否运行
aios hud --json | jq '.selection.dispatchHindsight'
```

### JSON 输出解析问题

```bash
# 验证 JSON 结构
aios hud --json | jq .

# 访问特定字段
aios hud --json | jq '.selection.sessionId'
aios hud --json | jq '.selection.dispatch.jobCount'
aios hud --json | jq '.selection.qualityGate.outcome'
```

## 示例

### 监控构建管道

```bash
# 后台启动构建，用 HUD 监控
aios orchestrate --live &
aios hud --watch --preset minimal --fast
```

### 调试失败会话

```bash
# 查看失败会话的完整详情
aios hud --session <failed-session-id> --preset full

# 导出 skill candidates 用于补丁
aios hud --session <failed-session-id> --export-skill-candidate-patch-template
```

### 多会话仪表板

```bash
# 同时监控多个 providers
# 终端 1
aios hud --provider codex --watch --preset minimal

# 终端 2
aios hud --provider claude --watch --preset minimal

# 终端 3（聚合视图）
aios team status --watch --preset minimal
```

## 相关文档

- [Team Ops](team-ops.md) - Team Operations 概述
- [Skill Candidates](skill-candidates.md) - 理解和应用补丁
- [ContextDB](contextdb.md) - 会话存储和检索

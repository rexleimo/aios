---
title: 单 Agent 夜跑
description: 用 ContextDB、run journal、resume/stop 控制和可选 worktree 隔离，让单个 coding agent 安全过夜跑任务。
---

# 单 Agent 夜跑

`Solo Harness` 是 RexCLI 里专门给**单个 agent 长任务**准备的执行通道。

当你想让一个 provider 围绕一个目标夜里持续推进，同时保留可读的 run journal、明确的 stop/resume 控制、以及可选的 git worktree 隔离时，就用它。

## 什么时候该用 Solo Harness

适合用：

- 目标很明确，比如“整理明早交接清单”或“补完发布检查表”。
- 任务不值得拆成多个并行 worker。
- 你想要可恢复的 operator loop，而不是一次性命令。
- 你希望夜跑改动尽量不污染主工作区。
- 你希望按需启用 lifecycle hooks 证据（`--hooks` / `--no-hooks`）。

不适合用：

- 任务可以拆成多个独立模块并行推进 -> 用 [多 Agent 实战](team-ops.md)。
- 你需要带 preflight gate 的阶段式 DAG -> 用 `aios orchestrate ...`。
- 需求还不清楚 -> 先用普通交互式 `codex` / `claude` 做分析。

## 快速开始

```bash
# 在隔离 worktree 里启动夜跑
aios harness run --objective "整理明早交接清单" --session nightly-demo --worktree --max-iterations 20

# 查看结构化状态
aios harness status --session nightly-demo --json

# 在 HUD 里看同一个 session
aios hud --session nightly-demo --json

# 请求它在安全边界停下
aios harness stop --session nightly-demo --reason "白天人工接手"

# 后面继续同一个 session
aios harness resume --session nightly-demo --max-iterations 10
```

## 包装客户端里的 Agent 自触发

启用 shell 包装后，交互式 `codex` / `claude` / `gemini` / `opencode` 会收到 AIOS 路由提示。默认仍然是 `single`；只有明确的长任务、过夜任务、可恢复任务、checkpoint 密集目标，才应该让 agent 自己选择 `harness`。

这类任务注入的命令形态是：

```bash
node <AIOS_ROOT>/scripts/aios.mjs harness run \
  --objective "<task>" \
  --provider codex \
  --max-iterations 8 \
  --worktree \
  --workspace <project-root>
```

可用下面变量调整注入的 provider 和循环预算：

```bash
export CTXDB_HARNESS_PROVIDER=claude
export CTXDB_HARNESS_MAX_ITERATIONS=12
```

如果完全不想注入路由提示，设置 `CTXDB_INTERACTIVE_AUTO_ROUTE=0`。

## 先 dry-run 再 live

如果你想先确认 artifact 结构，不想马上消耗 token：

```bash
aios harness run --objective "整理明早交接清单" --session nightly-demo --worktree --max-iterations 3 --dry-run --json
```

dry-run 会创建 session journal，但不会真的调用 provider。

## Hooks 开关

`run` 与 `resume` 支持显式 hooks 开关：

```bash
aios harness run --objective "整理明早交接清单" --session nightly-demo --hooks
aios harness resume --session nightly-demo --no-hooks
```

- 默认是 `--hooks`（开启），会记录 lifecycle hook 证据。
- 如果你想要更低噪声的执行循环，可用 `--no-hooks` 关闭。

## 迭代预算与工作区控制

- `--max-iterations <n>` 控制 `run` / `resume` 的循环预算；CLI 默认是 `20`，包装客户端自触发提示默认注入 `8`。
- `--workspace <path>` 强制把 ContextDB session artifact 写进指定项目根目录。适合从包装器、外部 checkout 或父目录触发 AIOS 时使用。
- `--provider <codex|claude|gemini|opencode>` 选择循环底层调用的本地 CLI。

## Solo Harness 会写哪些文件

artifact 统一落在：

```text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
```

核心文件：

- `objective.md`：标准化后的目标描述。
- `run-summary.json`：当前状态、迭代次数、backoff、worktree 信息。
- `control.json`：停止请求和 operator 备注。
- `hook-events.jsonl`：hooks 启用时的生命周期证据记录。
- `iteration-0001.json`：每轮归一化后的结果。
- `iteration-0001.log.jsonl`：每轮的原始日志流，方便排查。

## 推荐的 operator 操作链路

一个实用的夜跑链路通常是：

1. 用 `aios harness run --worktree` 启动。
2. 离开前先跑一次 `aios harness status --session <id> --json`。
3. 需要人工查看时用 `aios hud --session <id>`。
4. 想让它在下一个安全边界停下时，用 `aios harness stop --session <id>`。
5. 第二天或人工修完问题后，用 `aios harness resume --session <id>` 接着跑。

## Worktree 隔离怎么理解

夜跑场景强烈建议带 `--worktree`。

它会为当前 harness session 建一个隔离的 git worktree，避免 agent 直接改你的主工作区。如果这次运行没有产出有效结果，临时 worktree 可以自动清理；如果产生了值得保留的改动，run summary 会保留对应 metadata 供人工接手。

这套流程**不会**依赖粗暴的 `git reset --hard` 来恢复现场。

## Provider 和运行时说明

live 模式复用现有一次性 `scripts/ctx-agent.mjs` provider 调用链路。

也就是说，本机仍然需要安装并能直接运行对应 CLI：

- `codex`
- `claude`
- `gemini`
- `opencode`

如果 provider CLI 还没准备好，先用 dry-run，再去修 readiness。

## Solo Harness 和 Agent Team 怎么选

| 需求 | 更适合 |
|---|---|
| 单目标、单 provider、可恢复的过夜执行 | `aios harness ...` |
| 明确可拆分的并行多 worker 协作 | `aios team ...` |
| 带 preflight gate 的阶段式编排 | `aios orchestrate ...` |

## 相关文档

- [HUD 指南](hud-guide.md)
- [多 Agent 实战](team-ops.md)
- [按场景找命令](use-cases.md)
- [故障排查](troubleshooting.md)

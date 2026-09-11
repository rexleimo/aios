---
title: "Pi coding agent 成为 AIOS 一等公民客户端"
description: "AIOS 接入 Pi（earendil-works/pi）：skills、原生指令、harness 驱动、代码层 extension 与 RPC 控制——提示词层已通，嵌入层已至。"
date: 2026-09-11
tags: ["AIOS", "pi", "客户端", "extension", "harness", "skills"]
---

# Pi coding agent 成为 AIOS 一等公民客户端

Pi 是极简自扩展终端 harness：默认只给四个工具（`read`/`write`/`edit`/`bash`），其余全靠 TypeScript extension、skills、Pi package。这个哲学与 AIOS 一致——所以 AIOS 不把 Pi 当"又一个读 AGENTS.md 的 CLI"，而是直接嵌入进去。

## 落地内容

- **注册**：`pi` / `pi-coding-agent` 进入客户端矩阵，能力为 `skills` + `native` + `harness`。Pi 上游无 sub-agent，`team`/`agents` 不宣称，等 extension 验证后再说。
- **MCP 诚实建模**：Pi 无内置 MCP，registry 记为 `format: none` + 空 scopes，迁移/巡检/codemap 收集器天然跳过，不伪造。
- **原生 + skills**：Pi 指令层、项目 skills（`.pi/skills`）、全局 skills（`~/.pi/agent/skills`），25 个 AIOS skill 全量投放（`skills pi -> installed=25`）。
- **运行时**：ctx-agent one-shot（`pi -p`）与交互 builder、harness one-shot 策略、shell-bridge 支持（`install`/`update`/`config` 等包管理命令排除在包装外）。

## 代码层而非提示词层

`aios-pi-extension` 包（`packages/aios-pi`）是真正的质变：

- 四个模型可调工具，直连真实 CLI：记忆召回/写入/反馈（`memo search/add/useful`）与 skill 搜索。
- `tool_call` 门禁：拦毁灭性 shell（rm-rf、`--no-preserve-root`、fork 炸弹、`mkfs`、dd 写设备）与受保护写入（`.env*`、`node_modules/`、`.git/`）。
- `before_agent_start` 硬注入工作流策略 + 记忆摘要，即使 `--no-context-files` 也生效。
- `aios init --agent pi` 把入口写入 `~/.pi/agent/settings.json`，安装即治理插件面。
- `pi --mode rpc` JSONL 驾驶器（`scripts/lib/pi/rpc-client.mjs`）：长连接会话、命令关联、settle 检测、权限弹窗默认拒绝。

## 试用

```bash
aios init --agent pi --dry-run
node scripts/aios.mjs harness run --provider pi --dry-run --objective "pi smoke"
node --test scripts/tests/pi-extension.test.mjs scripts/tests/pi-rpc-client.test.mjs
```

待办：live-load 验证与包发布。单测契约（extension 8、RPC 7、客户端全矩阵）已全绿。

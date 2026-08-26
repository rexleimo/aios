---
title: "v5.8.1：Agent 不再卡死——aios-shell 冻结修复与 LLM 语义判断的需求澄清"
description: "AIOS v5.8.1 修复 aios-shell MCP 在执行长命令时冻结 opencode/codex 的问题，并把基于正则的模糊检测改为 LLM 语义判断——grilling 在执行中发生，一次只问一个决策问题。"
date: 2026-08-26
tags: ["AIOS", "发布", "MCP", "aios-shell", "需求", "grilling", "LLM", "稳定性"]
---

# v5.8.1：Agent 不再卡死——aios-shell 冻结修复与 LLM 语义判断的需求澄清

v5.8.1 修复了两个长期痛点：编码 Agent（opencode、codex）在长命令执行中冻结、无法恢复；以及工作流层发现不了"请求其实是模糊的"。

## 卡死问题：长命令冻结整个 Agent

如果你用 `aios_shell` 跑一条耗时的命令——构建、测试、几分钟的脚本——Agent 会彻底死掉。ping 无响应、取消无效、没有进度。你只能按 Esc 再发"继续"才能让它动起来。

根因是架构性的：MCP server 和 stdio proxy 都是**串行**处理 JSON-RPC 的。一条长命令阻塞了它后面所有请求，包括 Esc 触发的 `notifications/cancelled`。客户端根本取消不了命令，也永远等不到响应。

### 改动内容

- shell server 主循环改为**并发**：命令执行期间 ping、取消、其它请求仍即时响应。
- stdio proxy 同样并发转发，代理层不再被上游命令阻塞。
- `notifications/cancelled` 按 requestId 立即终止在途命令，而不是等超时。
- Windows 下用 `taskkill /T /F` 清理**整棵进程树**——不再有 cmd.exe 退出后残留的 node/npm/git 孤儿进程。
- 关闭 stdin 时清理所有在途命令，什么都不挂起。

aios-shell 代理链路保留：`aios-mcp-proxy.mjs` 仍附加 `_meta.aios` 观测元数据和本地 ref。RTK/Caveman 仍是客户端侧输出压缩（代理其实从不压缩输出——它原样转发，`SHELL_TOOL.description` 不再声称会压缩）。

并发修复之外，生成的 MCP server 配置现在带启动超时兜底（Codex 的 `startup_timeout_sec` 60/30/30；OpenCode 注入 `experimental.mcp_timeout: 90000`）。

## 另一个修复：识别"请求是模糊的"

工作流层之前用**正则**判断"这个请求模糊"。`VAGUE_BEHAVIOR_PATTERN` 这类模式只能命中显式措辞——"优化一下"、"tweak the login logic"——却漏掉更常见的情况：请求点名了具体功能，但没有验收标准、没有范围、没有成功定义。正则在用户恰好用了预期措辞时才触发，所以需求澄清经常根本不触发，Agent 就做错了东西。

### Grilling 现在是 LLM 判断 + 执行内嵌

- `derive-facts.mjs` 不再用正则从措辞推断模糊。
- requirements Capability 仅在 `grill`/`spec` intent（LLM 的语义判断）或领域词汇歧义 observation 时激活。
- `rex-requirements` 围绕**执行期内嵌 grilling** 重写：一次只问一个决策问题、带推荐答案、三轮收敛，且只在遇到真正决策点时问。Grilling 不是开头的前置审问会——Agent 先干活、自己查事实，只在某个决策真正属于用户时才停下来问。
- 因为工作流运行时在每个阶段边界都会重新选择下一个 Capability，澄清可以在交付中途插入，完成后原 Capability 继续。

技能 description 是双触发的：LLM 可以在请求模糊、范围不清、可多解时自助触发（即使点名了具体功能），rex-harness 也可以照旧激活。

## 升级

```bash
aios update
```

无需配置迁移。更新后重启 opencode/codex，让新的 shell server 和 proxy 生效。

## 本版本还包含

- `rex-code-review` 新增**场景化子代理验收模式**：隔离、无上下文污染的验收运行，覆盖正常/边界/异常场景，每个发现都带证据。
- 所有 MCP 配置生成器（Codex TOML、OpenCode JSON）默认输出启动超时。

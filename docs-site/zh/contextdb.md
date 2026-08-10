---
title: ContextDB：按需读取的项目记忆
description: 了解本地 ContextDB 注册表、memo 存储、统一项目搜索、延迟加载和跨客户端记忆边界。
---

# ContextDB 上下文数据库

## 一句话回答

ContextDB 是 AIOS 的本地项目记忆层。它把会话、事件、检查点、memo 和上下文包引用保存在项目工作区，让受支持的客户端可以跨会话找到相关事实。当前模式是 pull-based：项目注册表列出可用来源，Agent 根据任务召回需要的证据，而不是每次都收到完整历史。

## 现在就做

在项目根目录执行：

~~~bash
aios init --all
aios doctor --native --verbose
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
~~~

当前初始化会添加指向 .aios/context-db/index.json 的项目标记。

## 本地注册表

注册表是可用来源的小型索引。典型工作区包含：

~~~text
.aios/
  context-db/
    index.json                 # 来源注册表
    sessions/<session-id>/     # 会话事件和检查点
    index/                     # 派生搜索数据
    exports/                   # 上下文包和交接资料
  memo/
    file/events.jsonl          # 规范的 append-only 项目 memo
    split/                     # 可选的每条 memo 一个文件
~~~

实际文件会随客户端和已执行命令变化。注册表只是来源指针，不是整个仓库的副本。

## pull-based 如何工作

~~~text
客户端启动
  -> 读取 AGENTS.md、CLAUDE.md、GEMINI.md 或客户端指引
  -> 找到 .aios/context-db/index.json
  -> 检查来源元数据和任务相关性
  -> 搜索或读取 handoff、memo、checkpoint 或 context pack
  -> 只带着当前任务需要的证据继续
~~~

这种模式有助于控制上下文，但不保证某个固定的 prompt 大小或启动时间。如果来源缺失、过期或不在当前项目中，客户端仍需要新的明确指针。

## 会记录什么

| 来源 | 示例 | 用途 |
| --- | --- | --- |
| 会话事件 | prompt、工具结果、错误、修改路径 | 还原发生过什么 |
| 检查点 | 目标、状态、下一步、证据 | 恢复长任务 |
| Memo | 项目决策、约束、提醒 | 保存持久事实 |
| 上下文包 | 有边界的历史导出 | 交接选中的上下文片段 |
| 统一搜索 | memory、plans、docs、code 引用 | 大范围读取前定位证据 |

ContextDB 不会把未经验证的 Agent 回复变成证据。测试、诊断、审查记录和隐私检查仍是独立门禁。

## 使用 Memo 记忆 {#memory-with-memo}

### Workspace Memory AIOS Memo {#workspace-memory-aios-memo}

Memo 是持久项目笔记。默认规范后端是 .aios/memo/file/events.jsonl 下的 append-only JSONL；split 存储是可选项。

~~~bash
aios memo add "保持认证测试严格"
aios memo pin add "不要直接推送到 main"
aios memo search "认证"
aios memo recall "release readiness" --limit 5
aios memo storage status
~~~

需要时再切换或检查存储：

~~~bash
aios memo storage use split
aios memo storage use file
aios memo storage rebuild
aios memo storage doctor
aios memo storage repair-locks
~~~

rebuild 只更新派生查询文件，不重写规范 memo 记录。
`repair-locks` 只会隔离已确认记录 owner PID 死亡的锁；活动锁和格式错误的锁不会被修改。

## 统一项目搜索（v1.50.0） {#统一项目搜索v1500}

在大范围 grep 或读取整个仓库前使用统一搜索：

~~~bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

| 来源 | 包含内容 | 适合场景 |
| --- | --- | --- |
| memory | 项目共享及被允许的私有 memo | 决策和交接 |
| plans | docs/plans 和实施计划 | 目标和检查点 |
| docs | README、原生指引和公开文档 | runbook |
| code | scripts、mcp-server、测试和配置 | 实现事实 |
| all | 所有支持来源 | 第一次定向检索 |

项目共享 memo 对受支持客户端可见。Agent 私有笔记需要匹配运行时客户端 ID，例如 codex-cli、claude-code、gemini-cli、opencode-cli、hermes-agent 或 grok-build。

## 延迟加载（按需读取） {#lazy-load}

交互式会话默认使用延迟加载。兼容工作流需要完整上下文时可以请求：

~~~bash
export CTXDB_LAZY_LOAD=0
~~~

当 aios init 创建了注册表标记后，客户端可以通过注册表和 facade 指引发现上下文。旧版或未包装客户端可能使用兼容回退。延迟加载只是上下文选择行为，不保证每个来源都存在，也不保证客户端会自动查询每个来源。

## 上下文包和手动控制

需要交接或选定历史片段时使用有边界的上下文包：

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

诊断存储或构建可复现交接时，可使用低级 CLI：

~~~bash
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project my-app --goal "fix auth bug"
npm run contextdb -- checkpoint --session <id> --summary "auth fix done" --status running
npm run contextdb -- index:rebuild
~~~

普通用户从 aios init 和 native doctor 开始即可。

## 跨客户端记忆和隐私

当各客户端集成受支持且已同步时，不同客户端可以共享同一个项目注册表。注册表不会让一个客户端自动获得另一个客户端的私有 home 配置。运行 aios doctor --native --verbose 查看实际覆盖范围。

项目文件在本地，但 Agent 仍可能把选定内容发送到配置的模型供应商。可选包安装和 MCP 注册也有各自的网络边界。共享敏感文件前，先通过脱敏流程读取。

## 旧版兼容

旧包装器和脚本可能识别 .contextdb-enable 作为选择加入标记。当前入口是 aios init 和 .aios/context-db/index.json。只有兼容工作流明确要求时才保留旧开关；它不能替代初始化和验证。

## 常见问题

### ContextDB 是云数据库吗？

不是。注册表、会话数据、导出文件和规范 memo 都是本地工作区文件。客户端供应商和可选集成有各自的网络边界。

### 不同 Agent 会共享相同记忆吗？

如果每个客户端都受支持且已同步，它们可以共享同一项目 ContextDB。共享存储不等于每个客户端具有相同的路由、skill 或 MCP 能力。

### /new 或 /clear 之后会怎样？

这些命令只重置终端内对话，项目文件仍然存在。启动新的客户端会话，再使用注册表、统一搜索或命名上下文包召回相关证据。

### 可以关闭记忆吗？

停止客户端，检查项目指引，并按客户端说明移除或调整当前集成标记。只有旧兼容工作流使用了 .contextdb-enable 时才删除它。删除标记不会清除已有 .aios 数据。

### 哪些文件可以安全删除？

派生索引可以重建。sessions、exports 和 memo JSONL 属于源数据，删除前应备份。不要把凭据或客户端配置当作普通清理对象。

## 下一步

- [快速开始](getting-started.md) - 安装并初始化项目。
- [工作流策略](workflow-policy.md) - 选择 direct、guarded 或 planned。
- [Token Intelligence](token-compression.md) - 在不夸大压缩能力的前提下保持上下文有效。
- [架构](architecture.md) - 查看运行时层如何连接。
- [故障排查](troubleshooting.md) - 恢复缺失注册表或同步失败。

---
title: AIOS 故障排查
description: 用可观察证据诊断安装、ContextDB、客户端同步、工作流、Team、浏览器、Token 工具和隐私问题。
---

# 故障排查

## 一句话回答

先运行一个诊断命令并保留输出：

~~~bash
aios doctor --native --verbose
~~~

然后按症状分类。不要从 dry-run 推断实时供应商失败，也不要在找到第一个失败命令前删除项目数据。

## 安装和 Node.js

**症状：** 找不到 aios，或切换 Node 后 ContextDB 命令失败。

~~~bash
node -v
npm -v
command -v aios
aios doctor --native --verbose
~~~

预期是 Node.js 24 LTS 且能解析 aios 路径。macOS/Linux 重新加载 profile 或打开新 shell；Windows 使用 TLS 安全的安装命令并用 . $PROFILE 重新加载。涉及依赖构建时先运行定向测试，不要先删除 node_modules。

## ContextDB 和注册表

**症状：** 客户端找不到项目记忆。

~~~bash
test -f .aios/context-db/index.json
find .aios/context-db -maxdepth 2 -type f | head -n 30
aios doctor --native --verbose
~~~

确认是在正确项目根目录执行了 aios init --all。用统一搜索或明确的 memo/checkpoint 测试召回。旧版 .contextdb-enable 只是兼容开关，不代表当前初始化完成。

**症状：** 搜索结果为空。

~~~bash
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
aios memo storage status
aios memo storage rebuild
~~~

预期应看到来源列表或 storage 状态。检查规范 memo 文件后再重建派生索引。

## 客户端同步和路由快捷命令

**症状：** 原生指引或快捷命令缺失。

~~~bash
aios doctor --native --verbose
node scripts/aios.mjs init --all --dry-run
aios doctor --native --fix
~~~

应用修复前先阅读 dry-run。客户端能力不同；文件同步成功不代表供应商路由实时可用。

## Workflow Policy 和计划

**症状：** 只读问题创建了计划，或小改动被意外阻塞。

~~~bash
node scripts/aios.mjs plan auto-gate --task "Explain the current auth flow" --dry-run --json
node scripts/aios.mjs plan auto-gate --task "Refactor auth across modules" --json
~~~

查看 disposition 是 noop、direct、guarded 还是 planned，持久化是 none、reuse 还是 create。策略路由独立于编辑前安全门禁和最终验证。详见[工作流策略](workflow-policy.md)。

## Team 和 Solo Harness

**症状：** Team 或 Harness 停止、阻塞或没有实时进度。

~~~bash
aios team history --provider codex --limit 5
aios harness status --session <session-id> --json
aios hud --session <session-id> --json
~~~

先读第一个失败 job 或 iteration。Team 只重试 blocked 工作：

~~~bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
~~~

Solo 运行先带原因停止，修复第一个失败后再恢复：

~~~bash
aios harness stop --session <session-id> --reason "诊断第一个失败"
aios harness resume --session <session-id>
~~~

dry-run 只创建本地状态，不测试供应商凭据或实时路由。

## 浏览器 MCP

**症状：** 浏览器工具缺失或页面操作失败。

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

使用 browser-use CDP 默认路径：启动可见 CDP 浏览器，连接，读取 semantic snapshot 或定向文本，然后执行并验证。认证墙保留人工控制。Playwright MCP 是兼容路径。

## Token 工具

**症状：** RTK、Caveman 或 Headroom 缺失，或授权流程停止。

~~~bash
node scripts/aios.mjs init --all --dry-run
aios doctor --native --verbose
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

包安装授权和用户级 MCP 授权是分开的。修改前检查 external 或 conflict 的 Headroom 注册。没有 headroom_stats 的正 saved-token 总量，不要声称节省。

## 隐私和敏感文件

**症状：** 命令可能暴露凭据或私有配置。

~~~bash
aios privacy status
aios privacy read --file .env
~~~

只使用脱敏输出，绝不要分享原始 .env、cookie、token、私钥或浏览器 profile。需要日志时先去掉供应商 token 和个人路径。

## 常见问题

### 应该删除 .aios 来修复问题吗？

不要。先定位第一个失败；删除派生数据前备份 sessions、exports 和 memo JSONL。

### dry-run 成功意味着系统可用吗？

不意味着。它只证明本地解析和计划状态。涉及供应商和凭据时，运行一个小型 live task。

### 应该分享哪些输出？

分享命令、退出码、运行时版本和最小的脱敏片段。

## 下一步

- [快速开始](getting-started.md)
- [ContextDB](contextdb.md)
- [工作流策略](workflow-policy.md)
- [Token Intelligence](token-compression.md)
- [案例库](case-library.md)

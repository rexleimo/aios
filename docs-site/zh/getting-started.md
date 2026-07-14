---
title: 快速开始：安装并验证 Harness CLI
description: 使用当前命令安装 Harness CLI，初始化项目指引，并验证 ContextDB、客户端同步和本地安全检查。
---

# 快速开始

## 一句话回答

Harness CLI 是面向受支持编码客户端的本地工作流层。当前安装路径是：安装稳定版，在项目根目录执行 aios init --all，再用 aios doctor --native --verbose 查看结果。它会创建或更新项目指引和 ContextDB 注册表标记，不会取代你的客户端，也不会把所有历史事件塞进每个提示。

## 准备工作

- Node.js 24 LTS 和 npm
- Git
- 至少一个受支持的客户端：codex、claude、gemini、opencode、hermes 或 grok（Grok Build）
- 一个用于保存客户端指引和本地记忆的项目目录

先检查 Node.js：

~~~bash
node -v
npm -v
~~~

## 安装稳定版

=== "macOS / Linux"

    ~~~bash
    curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    ~~~

    如果使用 bash，请重新加载实际管理 PATH 的 profile，例如 source ~/.bashrc。

=== "Windows PowerShell"

    ~~~powershell
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    ~~~

稳定版安装脚本是推荐路径。只有明确需要 main 分支未发布源码时才克隆仓库。

## 初始化项目

在项目根目录执行：

~~~bash
aios init --all
aios doctor --native --verbose
~~~

aios init 可以安全重复运行。它会写入当前项目集成标记，并同步仓库中存在的受支持客户端指引。该标记指向 .aios/context-db/index.json，这是 pull-based ContextDB 的本地注册表。

无人值守安装应明确授予每类外部权限：

~~~bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

- --yes-compression-tools 授权无人值守安装 RTK、Caveman 和 Headroom 包。
- --yes-headroom-mcp 授权为支持该路径的客户端写入用户级 Headroom MCP 注册。
- --dry-run 只预览计划中的变化，不下载包，也不写入客户端配置。

## 启动第一个客户端

在同一个项目目录启动受支持的客户端：

~~~bash
codex
# 或：claude
# 或：gemini
# 或：opencode
# 或：hermes
# 或：grok
~~~

客户端可以通过项目注册表寻找相关指引和记忆。ContextDB 是 pull-based 的：需要项目事实时使用统一搜索、memo、检查点或上下文包。

## 验证安装

启动客户端后再次运行诊断：

~~~bash
aios doctor --native --verbose
ls .aios/context-db/
~~~

以诊断输出中的实际检查项和路径为准。警告不等于某个供应商或客户端路由可用；要验证实时路由，请运行一个小任务并保留状态或验证输出。

如果修改过 shell profile，请先重新加载：

=== "macOS / Linux"

    ~~~bash
    source ~/.zshrc
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    . $PROFILE
    ~~~

## 旧版兼容开关

部分旧兼容脚本仍识别 .contextdb-enable 作为选择加入标记。它不是当前安装的主要路径。

=== "macOS / Linux"

    ~~~bash
    touch .contextdb-enable
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    New-Item -ItemType File -Path .contextdb-enable -Force
    ~~~

只有在旧包装器或兼容工作流明确要求时才使用它。当前项目应使用 aios init 和 .aios/context-db/index.json 标记。创建旧文件不会迁移现有记忆，也不能证明客户端已经同步。

## 保存并搜索项目决策

~~~bash
aios memo add "保持认证测试严格"
aios memo search "认证"
aios memo storage status
~~~

Memo 是本地项目数据。默认项目 memo 使用 .aios/memo/file/events.jsonl 下的 append-only JSONL。ContextDB 页面会解释存储、作用域、重建和上下文包。

## 常见恢复命令

~~~bash
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

不确定客户端配置或包安装是否会变化时，先运行 dry run。向他人求助时保留诊断输出。

## 常见问题

### Harness CLI 会取代 codex、claude 或其他客户端吗？

不会。你仍然启动底层客户端。Harness CLI 在外层增加本地记忆、工作流路由、可选工具和验证指引。

### aios init 会上传项目记忆吗？

项目注册表和 memo 文件是本地文件。客户端供应商以及可选包或 MCP 设置仍有各自的网络和供应商边界；本地安装不等于后续所有模型流量都留在本机。

### 所有客户端都会共享同一份记忆吗？

在集成受支持且已同步的前提下，同一项目中的客户端可以使用同一个 ContextDB 注册表。运行 aios doctor --native --verbose 查看实际配置。

### 如何关闭当前项目的记忆？

停止客户端，按照客户端指引移除或调整项目集成标记，并在删除前检查现有 .aios/ 数据。如果旧工作流使用了 .contextdb-enable，可以移除该文件；仅删除标记不会删除历史文件。

## 下一步

| 需求 | 页面 |
| --- | --- |
| 了解项目记忆和统一搜索 | [ContextDB](contextdb.md) |
| 选择 direct、guarded 或 planned | [工作流策略](workflow-policy.md) |
| 并行运行独立工作 | [Agent Team](team-ops.md) |
| 运行可恢复长任务 | [Solo Harness](solo-harness.md) |
| 诊断安装失败 | [故障排查](troubleshooting.md) |
| 按意图查看命令 | [按场景找命令](use-cases.md) |

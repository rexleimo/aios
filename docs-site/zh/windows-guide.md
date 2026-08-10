---
title: Windows 指南：PowerShell 安装与恢复
description: 在 Windows 上使用 PowerShell 安装 AIOS，初始化项目，验证客户端同步，并处理常见 PATH 和配置问题。
---

# Windows 指南

## 一句话回答

使用 PowerShell 5.x 或 7，先为稳定版安装命令明确设置 TLS 1.2，重新加载 profile，然后执行 aios init --all 和 aios doctor --native --verbose。诊断输出是 PATH、Node.js、客户端同步和原生集成状态的事实来源。

## 前置条件

检查 shell 和运行时：

~~~powershell
$PSVersionTable.PSVersion
node -v
npm -v
git --version
~~~

使用 Node.js 24 LTS。如果安装器受执行策略限制，请遵循组织策略；不要把凭据或 profile 全文粘贴到支持请求中。

## 安装并重新加载 PowerShell

~~~powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
~~~

如果 profile 文件还不存在：

~~~powershell
New-Item -ItemType File -Path $PROFILE -Force
. $PROFILE
~~~

重新加载后 PATH 仍未更新时，打开新的 PowerShell 窗口。

## 初始化并验证项目

在项目根目录执行：

~~~powershell
aios init --all
aios doctor --native --verbose
~~~

项目标记指向 .aios/context-db/index.json。先阅读诊断结果，再启动客户端：

~~~powershell
codex
# 或：claude
# 或：gemini
# 或：opencode
# 或：hermes
# 或：grok
~~~

无人值守安装需要明确同意：

~~~powershell
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

使用 --dry-run 可在不写入包或客户端配置的情况下预览变化。

## 常见恢复命令

### 找不到 aios

~~~powershell
Get-Command aios -ErrorAction SilentlyContinue
$env:Path -split ';'
. $PROFILE
~~~

仍然找不到时，打开新的 PowerShell 进程并重新执行稳定版安装器。

### Node.js 版本不正确

~~~powershell
node -v
where.exe node
npm -v
~~~

安装或选择 Node.js 24 LTS，重新加载 profile，然后再次运行 aios doctor。保留诊断输出中第一个失败路径。

### 原生客户端同步不完整

~~~powershell
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

应用修复前先检查 dry-run 计划。客户端支持和路由深度可能不同；dry run 成功不代表实时供应商可用。

### 看不到项目记忆

~~~powershell
Test-Path .aios\context-db\index.json
Get-ChildItem .aios -Force
aios doctor --native --verbose
~~~

确认是在目标项目根目录运行了 aios init。旧版 .contextdb-enable 只供旧兼容脚本使用；当前安装使用 .aios/context-db/index.json 标记。

## 常见问题

### Windows 安装器会取代我的编码客户端吗？

不会。它安装 AIOS 层及其受支持的集成。你仍然运行 codex、claude、gemini、opencode、hermes 或 grok。

### 为什么要明确设置 TLS 1.2？

部分 Windows PowerShell 环境默认协商较旧协议。为安装请求设置 TLS 1.2 可以明确使用预期的 HTTPS 连接；它不会改变后续客户端或供应商的网络行为。

### 问题反馈应包含什么？

包含命令、退出码、Node 和 PowerShell 版本，以及相关的 aios doctor 输出。请脱敏 token、cookie、私有路径和客户端凭据。

## 下一步

- [快速开始](getting-started.md) - 跨平台安装流程。
- [故障排查](troubleshooting.md) - 按症状诊断。
- [工作流策略](workflow-policy.md) - 安装后选择工作流路径。

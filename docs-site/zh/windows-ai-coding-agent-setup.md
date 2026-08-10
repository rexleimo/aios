---
title: "Windows 上搭建 AI 编码 Agent：10 分钟安装与验证"
description: "在 Windows 上用 PowerShell 搭建 AI 编码 Agent：安装 AIOS、修复 PATH 问题、初始化项目、验证客户端同步、恢复常见故障——一份完整的低摩擦指南。"
date: 2026-08-10
schema_type: techarticle
---

# Windows 上搭建 AI 编码 Agent：10 分钟安装与验证

> **快速答案：** 在 Windows 上用一条 PowerShell 命令安装 AIOS，重载 profile，在项目里跑 `aios init --all`，再用 `aios doctor --native --verbose` 验证。如果之后 `aios` 未被识别，说明 PATH 没重载——重启 shell 或手动把安装目录加进 PATH。总计：不到 10 分钟拿到一个能用的、已验证的环境。

## 你需要什么

- Windows 10/11，PowerShell 5.x 或 7
- Git
- Node.js 24 LTS
- 至少一个编码客户端：Codex、Claude Code、Gemini CLI、OpenCode、Hermes 或 Grok

## 一条命令安装

打开 PowerShell 运行：

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
```

然后重载 profile 让 `aios` 命令生效：

```powershell
. $PROFILE
aios --version
```

## 初始化与验证

```powershell
cd C:\path\to\your\project
aios init --all
aios doctor --native --verbose
```

`aios init --all` 创建项目标记并检测支持的客户端。`aios doctor` 报告 ContextDB、客户端同步和安全检查——修它列出的第一个可操作项。

## 常见故障恢复

| 症状 | 修复 |
| --- | --- |
| 找不到 `aios` | 重载 profile（`. $PROFILE`）或重开 PowerShell；仍失败则手动把 AIOS 安装目录加入 PATH。 |
| `aios init` 中途失败 | 从项目根目录重跑 `aios init --all`；初始化器是幂等的。 |
| Doctor 报告客户端漂移 | 运行 `aios doctor --native --verbose`，检查 dry run，再应用建议的修复。 |
| 安装时 TLS 错误 | 安装命令前设置 `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`。 |

## FAQ

**AIOS 支持 Windows PowerShell 5.1 吗？**
支持——安装器和 wrapper 支持 PowerShell 5.x 和 7。

**需要 WSL 吗？**
不需要。AIOS 原生安装在 Windows 上；WSL 可选。

**能用 Windows Terminal 吗？**
能——AIOS 在 Windows Terminal、PowerShell ISE 和标准 PowerShell 控制台都可用。

## 下一步

读完整的 [Windows 指南](https://cli.rexai.top/zh/windows-guide/)看恢复流程，或从[快速开始](https://cli.rexai.top/zh/getting-started/)入手。

---
title: v5.10.0 — 发布可信与仓库减负
date: 2026-09-06
description: "Windows 回归全绿、发布证据门时序修复、Actions 按 SHA 钉死并加上 gitleaks 与 npm audit 门、仓库减负 461 个文件、提示词撰写规范落地：一个不发新特性、专门修复可信度问题的版本，附升级说明。升级前建议对照检查自己的流水线。"
---

# v5.10.0 — 发布可信与仓库减负

> 2026-09-06 · 不发新特性、专修"可信"的版本

## 核心变更

- **Windows 回归套件首次全绿**：两个慢性红测实为 CRLF 伪影；drift guard 行尾归一化 + `.gitattributes` 钉 LF，Windows 与 Linux CI 过同一套门。
- **发布证据门加固**：证据门前移到全量测试之前（快速失败）；`release-preflight.sh` 在证据存在未提交变更时拒绝通过——证据必须在被 tag 的 commit 里。
- **供应链钉死**：全部 GitHub Actions 钉完整 commit SHA；新增 gitleaks 密钥扫描；根目录与 mcp-server 新增 `npm audit --omit=dev --audit-level=critical` 门（基线 0 critical）；windows 冒烟改 `npm ci`。
- **仓库减负**：351 个 pptx node_modules 文件 + 110 个 `.cache/` 字体出库；根目录 4 个调试日志删除；认证产物 gitignore 白名单化，`skill certify` 不再需要 `git add -f`。
- **提示词撰写规范**：`docs/prompt-authoring-norms.md`——契约优先、语义判断模型自报告（ReAct 式）、硬门槛即验证协议；关键词/正则猜意图被明令禁止。
- **叙事对齐**：AGENTS.md / mkdocs 四语言 / README 统一为"AIOS 编排控制平面"定位，浏览器 MCP 标记 legacy。

## 升级说明

无破坏性行为变更。CI 会对 critical npm 通告与密钥扫描直接失败；Windows 开发者拉取后请重新检出以完成行尾归一。

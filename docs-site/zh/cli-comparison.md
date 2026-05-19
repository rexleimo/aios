---
title: CLI 对比
description: 将原生 Codex/Claude/Gemini CLI 工作流与 Harness CLI 编排层进行对比。
---

# 原生 CLI vs Harness CLI 层

Harness CLI 不是 Codex、Claude 或 Gemini CLI 的替代品。
它是它们之上的可靠性层。

[在 GitHub 上 Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[快速开始](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[案例集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## Harness CLI 改变了什么

| 工作流需求 | 仅用原生 CLI | 使用 Harness CLI 层 |
|---|---|---|
| 跨会话记忆 | 手动复制粘贴上下文 | 项目 ContextDB 默认恢复 |
| 跨 agent 接力 | 临时且脆弱 | 共享 session/checkpoint 工件 |
| 浏览器自动化 | 工具逐一配置漂移 | 统一 MCP 安装 + doctor 脚本 |
| 敏感配置读取安全 | 容易将密钥泄露到 prompts | Privacy Guard 脱敏路径 |
| 操作恢复 | 手动排查 | Doctor 脚本 + 可复现 runbook |

## 何时仅用原生 CLI

- 你需要一个没有接力的临时短任务。
- 你不需要会话持久性或工作流可追溯性。
- 你在一次性环境中实验。

## 何时添加 Harness CLI

- 你在同一个项目中切换使用 `codex`、`claude`、`gemini` 或 `opencode`。
- 你需要重启安全的上下文和可审计的 checkpoint。
- 你需要浏览器自动化和认证墙处理，且有明确的人工交接。
- 你必须减少配置读取期间的意外密钥暴露。

## 快速验证（5 分钟）

```bash
git clone https://github.com/rexleimo/rex-cli.git
cd rex-cli
scripts/setup-all.sh --components all --mode opt-in
source ~/.zshrc
codex
```

然后验证持久化工件存在：

```bash
ls .aios/context-db
```

预期结果：`sessions/`、`index/`、`exports/`。

## 深度案例

- [案例：跨 CLI 接力](case-cross-cli-handoff.md)
- [案例：浏览器认证墙流程](case-auth-wall-browser.md)
- [案例：Privacy Guard 配置读取](case-privacy-guard.md)

## 下一步

[在 GitHub 上 Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }

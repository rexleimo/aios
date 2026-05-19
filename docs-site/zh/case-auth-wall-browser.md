---
title: 案例 - 浏览器认证墙流程
description: 检测 challenge/auth 墙并在 human-in-the-loop handoff 下安全继续。
---

# 案例：浏览器认证墙流程

[在 GitHub 上 Star](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="github_star" }
[对比工作流](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="compare_workflows" }
[案例集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="case_library" }

## 何时使用

当浏览器自动化遇到登录墙、Cloudflare 检查或 challenge 页面时使用。

## 运行

启动并导航：

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://target.site"}
```

检查墙状态：

```text
browser_auth_check {"profile":"default"}
browser_challenge_check {"profile":"default"}
```

如果需要人工操作，在同一 profile 中手动完成登录/challenge，然后继续：

```text
browser_snapshot {"profile":"default","includeAx":true}
```

## 证据

1. 工具输出清楚标明墙状态（`requiresHumanAction`、challenge/auth 提示）。
2. 手动完成后，`browser_snapshot` 在登录后页面成功。
3. 自动化不会尝试绕过。

## 为什么重要

可靠的自动化不是盲目自动化。
此流程确保对政策敏感的操作由人工明确门控，然后使用共享浏览器状态恢复。

[Star on GitHub](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_footer" data-rex-target="github_star" }

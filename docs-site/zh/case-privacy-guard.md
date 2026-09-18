---
title: 案例 - Privacy Guard 配置读取
description: "真实案例：需要读取 .env、配置或凭据类文件时，如何在内容进入模型前完成脱敏，只保留必要字段，同时留下可追溯的审计记录，让 Agent 在安全投影上继续工作，把「帮我看一下配置」变成一次可控、可复核的操作。文中给出脱敏规则示例与验收清单，可直接复制到自己的项目里。"
---

# 案例：Privacy Guard 配置读取

[在 GitHub 上 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_privacy_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="github_star" }
[对比工作流](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="compare_workflows" }
[案例集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="case_library" }

## 何时使用

在分享可能包含密钥、token、cookies 或类 session 数据的配置文件前使用。

## 运行

检查状态：

```bash
aios privacy status
```

通过脱敏路径读取敏感文件：

```bash
aios privacy read --file config/browser-profiles.json
```

可选本地模型增强：

```bash
aios privacy ollama-on
```

## 证据

1. 输出已脱敏，不暴露原始密钥。
2. 配置意图仍可读，用于排查/审查。
3. `privacy status` 确认严格模式已启用。

## 为什么重要

团队经常通过将原始配置粘贴到 prompts 来泄露密钥。
Privacy Guard 将有风险的读取转变为可重复的安全默认。

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_privacy_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_privacy_footer" data-rex-target="github_star" }

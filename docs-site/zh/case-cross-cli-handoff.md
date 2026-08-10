---
title: 案例 - 跨 CLI 接力
description: 使用共享 ContextDB 实现 Claude 分析、Codex 实现和 Gemini 审查的可复现流程。
---

# 案例：跨 CLI 接力

[在 GitHub 上 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="github_star" }
[对比工作流](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="compare_workflows" }
[案例集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="case_library" }

## 何时使用

当一个模型应该分析、另一个应该实现、还有一个应该审查，且不能丢失上下文时使用。

## 运行

```bash
scripts/ctx-agent.sh --agent claude-code --project AIOS --prompt "分析障碍并提出首要修复方案。"
scripts/ctx-agent.sh --agent codex-cli --project AIOS --prompt "根据最新 checkpoint 实现首要修复。"
scripts/ctx-agent.sh --agent gemini-cli --project AIOS --prompt "审查回归风险和缺失的测试。"
```

## 证据

1. 共享 session/checkpoints 在以下位置更新：

```bash
ls .aios/context-db/sessions
```

2. 时间线显示跨 agent 连续性：

```bash
cd mcp-server
npm run -s contextdb -- timeline --project AIOS --limit 12
```

3. 最新 session 存在导出的 context packet：

```bash
ls .aios/context-db/exports | tail -n 5
```

## 为什么重要

没有共享层，跨 agent 接力往往会退化为复制粘贴上下文。
有了 AIOS，所有 agent 都读写同一个项目上下文路径和 checkpoint 流。

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_footer" data-rex-target="github_star" }

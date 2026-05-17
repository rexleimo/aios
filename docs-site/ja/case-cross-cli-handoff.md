---
title: ケース - クロス CLI handoff
description: 共有 ContextDB で Claude 分析、Codex 実装、Gemini レビューを再現可能なフロー。
---

# ケース：クロス CLI handoff

[GitHub で Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="github_star" }
[ワークフロー比較](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="compare_workflows" }
[ケース集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="case_library" }

## いつ使うか

あるモデルは分析し、別のモデルは実装し、別のモデルはコンテキストを失うことなくレビューすべき場合にを使います。

## 実行

```bash
scripts/ctx-agent.sh --agent claude-code --project RexCLI --prompt "障碍を分析し、主な修正案を提案する。"
scripts/ctx-agent.sh --agent codex-cli --project RexCLI --prompt "最新の checkpoint から主な修正を実装する。"
scripts/ctx-agent.sh --agent gemini-cli --project RexCLI --prompt "回帰リスクと欠落しているテストをレビューする。"
```

## 証拠

1. 共有 session/checkpoints が以下で更新される：

```bash
ls .aios/context-db/sessions
```

2. タイムラインがクロース agent の連続性を示す：

```bash
cd mcp-server
npm run -s contextdb -- timeline --project RexCLI --limit 12
```

3. 最新 session のエクスポート済み context packet が存在：

```bash
ls .aios/context-db/exports | tail -n 5
```

## なぜ重要か

共有レイヤーなしでは、クロース agent handoff はしばしばコピー/ペーストコンテキストに退化します。
RexCLI では、すべての agent が同じプロジェクトコンテキストパスと checkpoint ストリームを読み書きします。

[Star on GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_footer" data-rex-target="github_star" }

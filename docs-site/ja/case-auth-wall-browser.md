---
title: ケース - ブラウザ認証壁フロー
description: challenge/認証壁を検出し、human-in-the-loop handoff で安全に続行。
---

# ケース：ブラウザ認証壁フロー

[GitHub で Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="github_star" }
[ワークフロー比較](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="compare_workflows" }
[ケース集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="case_library" }

## いつ使うか

ブラウザ自動化がログイン壁、Cloudflare チェック、challenge ページに遭遇した時に使います。

## 実行

起動してナビゲート：

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://target.site"}
```

壁の状態を確認：

```text
browser_auth_check {"profile":"default"}
browser_challenge_check {"profile":"default"}
```

人間の操作が必要な場合、同じ profile でログイン/challenge を手動で完了してから続行：

```text
browser_snapshot {"profile":"default","includeAx":true}
```

## 証拠

1. ツール出力が壁の状態を明確に示す（`requiresHumanAction`、challenge/認証のヒント）。
2. 手動完了後、`browser_snapshot` がログイン後ページで成功。
3. 自動化はバイパスを試行しない。

## なぜ重要か

信頼できる自動化は盲目的な自動化ではありません。
このフローはポリシーに関連するステップを明示的に human-gated に保ち、共有ブラウザ状態で再開します。

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_footer" data-rex-target="github_star" }

---
title: 公式ケースライブラリ
description: Harness CLI で実行できる代表シナリオを再現可能なコマンド付きで整理。
---

# 公式ケースライブラリ

このページは `Harness CLI` の能力マップです。

各ケースは次の3つを含みます：

- `いつ使うか`：意思決定のトリガー
- `実行`：コピペ可能なコマンド
- `証拠`：成功を証明するもの

## おすすめディープダイブ

[GitHub で Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_library_featured_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="github_star" }
[ワークフロー比較](cli-comparison.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="compare_workflows" }
[ケース：クロス CLI handoff](case-cross-cli-handoff.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_handoff" }
[ケース：ブラウザ認証壁フロー](case-auth-wall-browser.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_authwall" }
[ケース：Privacy Guard 設定読み取り](case-privacy-guard.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_privacy" }

## ケース 1：新規マシン 5 分初期セットアップ

**いつ使うか**

新しいノート PC やチームメンバーのオンボーディングで、すばやくクリーンなベースラインが必要な場合。

**実行**

```bash
scripts/setup-all.sh --components all --mode opt-in
scripts/verify-aios.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-all.ps1 -Components all -Mode opt-in
powershell -ExecutionPolicy Bypass -File .\scripts\verify-aios.ps1
```

**証拠**

- `verify-aios` が終了コード `0` で終了
- `doctor-*` チェックにブロッキングエラーなし

## ケース 2：Browser MCP インストールとスモークテスト

**いつ使うか**

デモや agent ワークフローにブラウザ自動化（`browser_*`）が必要な場合。

**実行**

```bash
scripts/install-browser-mcp.sh
scripts/doctor-browser-mcp.sh
```

クライアントチャットで実行：

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://example.com"}
browser_snapshot {"includeAx":true}
browser_close {}
```

**証拠**

- `doctor-browser-mcp` が `Result: OK` を報告（警告は許容）
- スモークコマンドが構造化されたツール応答を返し、ランタイム例外なし

## ケース 3：クロス CLI handoff

**いつ使うか**

Claude に分析させ、Codex に実装させ、Gemini にレビューさせたいがコンテキストを失いたくない場合。

**実行**

```bash
claude
codex
gemini
```

または確定的な one-shot：

```bash
scripts/ctx-agent.sh --agent claude-code --prompt "障碍を要約して次のステップを提案"
scripts/ctx-agent.sh --agent codex-cli --prompt "最新の checkpoint から最優先の修正を実装"
scripts/ctx-agent.sh --agent gemini-cli --prompt "回帰リスクと欠落テストをレビュー"
```

**証拠**

- `.aios/context-db/` に新しい session/checkpoint アーティファクト
- 後の CLI 実行は同じプロジェクトコンテキストを使用して継続可能

## ケース 4：認証壁処理（人間の介在）

**いつ使うか**

自動化がログイン壁（Google、Meta、プラットフォーム認証）に遭遇し、盲目的にバイパスすべきでない場合。

**実行**

```text
browser_launch {"profile":"local"}
browser_navigate {"url":"https://target.site"}
browser_auth_check {}
```

`requiresHumanAction=true` の場合、同じブラウザ profile で手動ログインを完了し、`browser_snapshot` / `browser_click` / `browser_type` で続行。

**証拠**

- `browser_auth_check` が明示的な認証状態フィールドを返す
- 手動ログイン後、同じ profile でフローが再開

## ケース 5：One-shot 監査可能実行チェーン

**いつ使うか**

1 コマンドで監査可能なレコード（`init -> session -> event -> checkpoint -> pack`）を生成する必要がある場合。

**実行**

```bash
scripts/ctx-agent.sh --agent codex-cli --project Harness CLI --prompt "最新の checkpoint から次を実行"
```

**証拠**

- `.aios/context-db/index/checkpoints.jsonl` に新しい checkpoint エントリ
- `.aios/context-db/exports/` にエクスポート済み context packet

## ケース 6：Skills ライフサイクル運用

**いつ使うか**

複数の CLI 間で共有 skills を管理し、予測可能なライフサイクル操作が必要な場合。

**実行**

```bash
scripts/install-contextdb-skills.sh
scripts/doctor-contextdb-skills.sh
scripts/update-contextdb-skills.sh
# ロールバックが必要な場合
scripts/uninstall-contextdb-skills.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-skills.ps1
# ロールバックが必要な場合
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-skills.ps1
```

**証拠**

- Doctor 出力が対象が存在し健全であることを確認
- 更新/削除でdangling な壊れたリンクが発生しない

## ケース 7：Shell ラッパー修復とロールバック

**いつ使うか**

ユーザーがコマンドラッパー問題を報告し、安全な回復パスが必要な場合。

**実行**

```bash
scripts/doctor-contextdb-shell.sh
scripts/update-contextdb-shell.sh
# 完全ロールバックが必要な場合
scripts/uninstall-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-shell.ps1
# 完全ロールバックが必要な場合
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-shell.ps1
```

**証拠**

- Wrapper doctor がブロッキング問題を報告しなくなる
- ロールバック後、ネイティブ `codex`/`claude`/`gemini` コマンドが正常に動作

## ケース 8：リリース前セキュリティヘルスチェック

**いつ使うか**

更新を公開する前に、skills/hooks/MCP 設定に安全でない設定のドリフトがないことを確認。

**実行**

```bash
scripts/doctor-security-config.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-security-config.ps1
```

**証拠**

- Security doctor が `0` で終了
- すべての警告がリリース前にレビューされ解決済み

## 新規公式ケースの投稿

このライブラリにケースを提案するには：

1. プレースホルダーなしの正確なコマンドを含める。
2. 測定可能な証拠を定義（終了コード、ファイルアーティファクト、またはツール応答）。
3. 関連する場合はロールバック/回復ステップを追加。

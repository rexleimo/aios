---
title: "Orchestrate Live: 安全な opt-in Subagent Runtime"
description: "dry-run と live の違い、制限付き並列 phase、JSON handoff、所有権ゲート、provider readiness を説明します。"
date: 2026-06-20
tags: ["オーケストレーション", "Subagent", "Agent Team", "dry-run", "runtime"]
---

# Orchestrate Live が実用段階へ: Subagent Runtime を追加

> **Quick Answer:** `dry-run` はモデル runtime を呼ばず、計画と handoff をローカルで検証します。`live` は明示的な opt-in で、選択した CLI を通じて phase を実行し、JSON handoff とファイル所有権を検証します。dry-run の成功は provider、ブラウザ、認証の readiness を証明しません。

`aios orchestrate` を「blueprint + dry-run の安全なハーネス」として使っている場合、今回の更新で `subagent-runtime` による live 実行が利用できるようになりました。

## 何が変わったか

以前:

- `--execute dry-run` は DAG 生成と handoff のローカル模擬のみ (0 トークン)
- `--execute live` は gate があるだけで、実行自体は stub に近い

現在:

- `--execute live` が `codex` / `claude` / `gemini` の CLI 経由で各フェーズを実行
- 並列フェーズは `AIOS_SUBAGENT_CONCURRENCY` で並列度を制御
- merge-gate が JSON handoff を検証し、ファイル所有権の衝突をブロック

## 使い方 (opt-in)

live 実行はデフォルト無効です:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli  # または claude-code, gemini-cli
aios orchestrate --session <session-id> --dispatch local --execute live --format json
```

Tip (codex-cli): Codex CLI v0.114+ は `codex exec` の構造化出力 (`--output-schema`, `--output-last-message`, stdin) をサポートします。AIOS は利用可能なら自動で使用し、JSON handoff を安定化します。

## よく使う環境変数

- `AIOS_SUBAGENT_CONCURRENCY` (default: `2`)
- `AIOS_SUBAGENT_TIMEOUT_MS` (default: `600000`)
- `AIOS_SUBAGENT_CONTEXT_LIMIT` (default: `30`)
- `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET` (optional)

トークンコスト:

- `dry-run` はモデルランタイムを呼びません
- `live` は選択した CLI を呼ぶため、トークン/コストはそのクライアント依存です

## Failure Semantics（失敗時に表示されるもの）

`subagent-runtime` は構造化された各ジョブ結果を返します。以下の場合にジョブは `blocked` とマークされます:

- 依存関係がブロックされている
- 選択した CLI コマンドが存在しない
- サブエージェント出力が有効な JSON でない（handoff スキーマの解析/検証が失敗）
- merge gate がファイル所有権の競合をブロック

## なぜ重要か

これにより、新しいランタイムを発明することなくオーケストレーションを実行可能にします:

- 同じ blueprints
- 同じ ContextDB セッション記憶
- 同じ merge/所有権ルール
- これで本当の（opt-in）並列実行が可能に

## 2026-03-16 進捗アップデート

この投稿公開以降、同じセッションでライブサンプリングを継続し、ランタイム安定性を検証しています:

- 最新ライブアーティファクト: `dispatch-run-20260316T111419Z.json` (`dispatchRun.ok=true`)
- 上流 handoff が `filesTouched=[]` を報告した場合、`review` / `security` は自動完了（`0ms`）
- `learn-eval` 平均経過時間が `160678ms` に改善しましたが、`sample.latency-watch` はまだアクティブです
- Timeout 予算は、latency-watch が解消され、Windows ホスト検証エビデンスが完全に閉じるまで意図的に変更しません

実践的なポイント: ライブオーケストレーションは日常使用に十分な安定性がありますが、予算の厳格化はエビデンス主導であるべきです。

## FAQ

### dry-run はモデルのトークンを消費しますか？

いいえ。dry-run は計画と模擬 handoff をローカルで検証します。live は選択した CLI を呼び出すため、トークンや provider の費用が発生する場合があります。

### live の phase は何によってブロックされますか？

CLI の不足、無効な JSON handoff、ブロックされた依存関係、ファイル所有権の衝突、タイムアウト、または人的ゲートが原因になります。再試行する前に構造化された結果を確認してください。

### live はデフォルトで有効ですか？

いいえ。明示的な opt-in と、実際に利用できる provider/client が必要です。readiness、認証状態、許可範囲は別々に確認します。

## 公式ドキュメント

[Agent Team](https://cli.rexai.top/ja/team-ops/)、[Workflow Policy](https://cli.rexai.top/ja/workflow-policy/)、[Solo Harness](https://cli.rexai.top/ja/solo-harness/)、[Troubleshooting](https://cli.rexai.top/ja/troubleshooting/)を参照してください。

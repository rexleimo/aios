---
title: ソロ Harness
description: ContextDB、run journal、resume/stop 制御、必要に応じた worktree 分離で、1つの coding agent を夜通し安全に動かします。
---

# ソロ Harness

`Solo Harness` は、Harness CLI における**単一 agent の長時間実行レーン**です。

1つの provider に1つの目標を夜通し進めさせつつ、読みやすい run journal、明示的な stop/resume 制御、必要に応じた git worktree 分離を保ちたい時に使います。

## いつ Solo Harness を使うか

向いている場面:

- 「明朝の引き継ぎメモをまとめる」「リリースチェックリストを仕上げる」のように目標が明確。
- 複数 worker に分割するほどではない。
- one-shot ではなく、再開可能な operator loop が欲しい。
- 夜間の変更をメイン checkout から分離したい。
- `--hooks` / `--no-hooks` で lifecycle hook 証跡を制御したい。

向いていない場面:

- 作業を独立モジュールに分割して並列化できる -> [Agent Team](team-ops.md) を使う。
- preflight gate 付きの段階 DAG が必要 -> `aios orchestrate ...` を使う。
- 要件がまだ曖昧 -> まず通常の対話型 `codex` / `claude` で分析する。

## クイックスタート

```bash
# 分離 worktree で夜間実行を開始
aios harness run --objective "明朝の引き継ぎメモをまとめる" --session nightly-demo --worktree --max-iterations 20

# 構造化ステータス確認
aios harness status --session nightly-demo --json

# 同じ session を HUD で確認
aios hud --session nightly-demo --json

# 安全な境界で停止を依頼
aios harness stop --session nightly-demo --reason "朝に人が引き継ぐ"

# 後で同じ session を再開
aios harness resume --session nightly-demo --max-iterations 10
```

## ラップされた CLI からの agent 自己トリガー

shell wrapping が有効な場合、対話型 `codex` / `claude` / `gemini` / `opencode` セッションは AIOS route prompt を受け取ります。通常は `single` のまま進め、明示的な長時間・夜間・再開可能・checkpoint 重視の目標だけ `harness` を選びます。

この場合に注入されるコマンドの形は次の通りです:

```bash
node <AIOS_ROOT>/scripts/aios.mjs harness run \
  --objective "<task>" \
  --provider codex \
  --max-iterations 8 \
  --worktree \
  --workspace <project-root>
```

provider とループ予算は環境変数で上書きできます:

```bash
export CTXDB_HARNESS_PROVIDER=claude
export CTXDB_HARNESS_MAX_ITERATIONS=12
```

route prompt 自体を無効化する場合は `CTXDB_INTERACTIVE_AUTO_ROUTE=0` を設定してください。

## まず dry-run

token を使う前に artifact 契約だけ確認したい場合:

```bash
aios harness run --objective "明朝の引き継ぎメモをまとめる" --session nightly-demo --worktree --max-iterations 3 --dry-run --json
```

Dry-run は session journal を作りますが、provider は呼びません。

## Hooks 切り替え

`run` と `resume` は hooks を明示的に切り替えできます:

```bash
aios harness run --objective "明朝の引き継ぎメモをまとめる" --session nightly-demo --hooks
aios harness resume --session nightly-demo --no-hooks
```

- 既定は `--hooks`（有効）で、lifecycle hook 証跡を記録します。
- 低ノイズ運用にしたい場合は `--no-hooks` を使ってください。

## 反復予算と workspace 制御

- `--max-iterations <n>` は `run` / `resume` のループ予算を制限します。CLI の既定値は `20`、ラップ済みクライアントの自己トリガー prompt は `8` です。
- `--workspace <path>` は ContextDB session artifact をそのプロジェクトルートへ強制的に書き込みます。wrapper、外部 checkout、親ディレクトリから AIOS を起動する時に使います。
- `--provider <codex|claude|gemini|opencode>` はループで使うローカル CLI を選びます。

## 生成されるファイル

artifact は次の場所に保存されます:

```text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
```

主なファイル:

- `objective.md`: 正規化された目標。
- `run-summary.json`: 現在状態、反復回数、backoff、worktree 情報。
- `control.json`: stop 要求と operator メモ。
- `hook-events.jsonl`: hooks 有効時の lifecycle 証跡ログ。
- `iteration-0001.json`: 各反復の正規化結果。
- `iteration-0001.log.jsonl`: デバッグ用の生ログ。

## 実運用ループ

実用的な夜間ループは次のようになります:

1. `aios harness run --worktree` で開始。
2. 離席前に `aios harness status --session <id> --json` を確認。
3. 人が読みやすいスナップショットが必要なら `aios hud --session <id>`。
4. 次の安全な境界で止めたいなら `aios harness stop --session <id>`。
5. 翌朝または手動修正後に `aios harness resume --session <id>`。

## Worktree 分離について

夜間実行では `--worktree` を強く推奨します。

現在の harness session 専用の git worktree を作成し、agent がメイン checkout を直接変更しないようにします。意味のある出力がなければ一時 worktree を自動クリーンアップできます。残す価値のある変更がある場合は、operator が確認できるよう run summary に metadata を残します。

このフローは、乱暴な `git reset --hard` 前提ではありません。

## Provider / Runtime の注意

live 実行は既存の one-shot `scripts/ctx-agent.mjs` provider パスを再利用します。

そのため、対応するローカル CLI がインストール済みで直接実行可能である必要があります:

- `codex`
- `claude`
- `gemini`
- `opencode`

provider CLI が未準備なら、まず dry-run を使って readiness を整えてください。

## Solo Harness と Agent Team の使い分け

| ニーズ | 向いているもの |
|---|---|
| 単一目標・単一 provider・再開可能な夜間実行 | `aios harness ...` |
| 分割可能なタスクを複数 worker で並列実行 | `aios team ...` |
| preflight gate 付き段階 orchestration | `aios orchestrate ...` |

## 関連ドキュメント

- [HUD ガイド](hud-guide.md)
- [Agent Team](team-ops.md)
- [シナリオ別コマンド](use-cases.md)
- [トラブルシューティング](troubleshooting.md)

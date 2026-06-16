---
title: シナリオ別コマンド
description: 先に概念を暗記せず、「今何をしたいか」から Harness CLI コマンドを選びます。
---

# シナリオ別コマンド

このページは1つの質問に答えます: **今どのコマンドを実行すればよいか？**

<figure class="rex-visual">
  <img src="../assets/visual-contextdb-memory-loop.svg" alt="ContextDB のプロジェクト記憶ループ: .contextdb-enable 後に codex、claude、gemini がローカル記憶を共有">
  <figcaption>多くのシナリオの中心は同じです。プロジェクトルートで ContextDB を有効化すると、異なる CLI が同じローカル文脈へ接続できます。</figcaption>
</figure>

## インストールして環境確認したい

```bash
aios
```

TUI で順番に実行:

1. **Setup**: shell wrapper、skills、browser などをインストール。
2. **Doctor**: Node、MCP、skills、native 設定を確認。
3. **Update**: 今後のアップグレードもここから実行。

コマンドライン経路:

```bash
aios setup --components all --mode opt-in --client all
aios doctor --native --verbose
```

## agent に現在のプロジェクトを覚えさせたい

```bash
cd /path/to/project
touch .contextdb-enable
codex
```

以後、同じプロジェクトで `codex`、`claude`、`gemini`、`opencode` を実行すると、すべて同じ ContextDB に接続します。

## 継続的な運用メモを使いたい（Memo + Persona）

CLI 上で長期的な制約や好みを残すなら `aios memo` を使います:

```bash
aios memo add "Need strict pre-PR checks #quality"
aios memo pin add "Avoid destructive git commands."
aios memo recall "quality gate" --limit 5
aios memo storage status
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user add "Preferred language: zh-CN + technical English terms"
```

記憶レイヤーの目安:

- `memo add/search/recall` -> canonical `.aios/memo` storage（legacy ContextDB mirror は互換用のみ）
- `memo pin` -> canonical `.aios/memo` pinned file（legacy mirror は互換用のみ）
- `memo persona/user` -> `ctx-agent` の Memory prelude に注入されるグローバル identity ファイル

Default storage は `file`（`.aios/memo/file/events.jsonl`）です。memo event ごとに 1 JSON file が必要な場合だけ `aios memo storage use split` を使います。`storage rebuild` は derived query files のみを更新します。

Persona は agent baseline（「この AI はどう振る舞うべきか」）用です。User profile は安定した operator preference（「このユーザーはどのような納品を望むか」）用です。どちらも注入前に安全スキャンと容量制限を受けます。

## CLI をまたいで引き継ぎたい

```bash
claude   # 先に分析
codex    # 次に実装
gemini   # 最後にレビューまたは比較
```

同じプロジェクトディレクトリで実行すれば、ContextDB がイベントと checkpoint を保存し、ツールを切り替えても文脈を失いにくくします。

## 1つの agent を夜通し動かしたい

向いている: 目標が明確、provider は1つでよい、夜間に継続実行したい、並列 worker は不要。

```bash
aios harness run --objective "明朝の引き継ぎメモをまとめる" --session nightly-demo --worktree --max-iterations 20
aios harness status --session nightly-demo --json
aios hud --session nightly-demo --json
```

安全な境界で止めたい、または後で再開したい場合:

```bash
aios harness stop --session nightly-demo --reason "朝に人が引き継ぐ"
aios harness resume --session nightly-demo
```

hooks 証跡を制御したい場合は明示指定できます:

```bash
aios harness run --objective "明朝の引き継ぎメモをまとめる" --session nightly-demo --hooks
aios harness resume --session nightly-demo --no-hooks
```

「1つの agent に1つの目標を継続させたい」なら [ソロ Harness](solo-harness.md)。本当に並列化できるなら [Agent Team](team-ops.md) を使います。

ヒント: ラップされた `codex` / `claude` / `gemini` / `opencode` から開始し、夜間・再開可能な作業を明示した場合、起動 route prompt は agent に同じ `aios harness run ... --workspace <project-root>` コマンドを自己トリガーさせます。手動で覚える必要はありません。

## Agent Team を使いたい

適している: モジュールが独立、タスクが分割可能、token コストを許容できる。

```bash
# dry-run プレビュー（安全、モデル呼び出しなし）
aios team 3:codex "X を実装し、完了前にテストを実行し、変更を要約"

# GroupChat live 実行（ラウンドベース、共有会話）
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli aios team 3:codex "X を実装"

# 進捗監視
aios team status --provider codex --watch
```

live モードでは、Agent Team は **GroupChat Runtime** を使用します：エージェントが共有会話スレッドでラウンド実行されます。planner がタスクを分析し、implementer がラウンドごとに並列作業し、reviewer が検証します。ブロックされたエージェントは自動的に re-plan ラウンドをトリガーします。

agent 追加、routing 変更、workflow skill 更新を行う場合は、live 実行を信頼する前に governance 証跡を記録します。

```bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

適さない: 要件が曖昧、小さな bug、複数 worker が同じファイルを編集しそうな場合。この時は通常の `codex` から始めます。

## 進捗と履歴を見たい

```bash
aios hud --provider codex
aios team status --provider codex --watch
aios team history --provider codex --limit 20
```

最近の失敗だけを見たい場合:

```bash
aios team history --provider codex --quality-failed-only
```

## quality gate を実行したい

```bash
aios quality-gate pre-pr --profile strict
```

PR 前、または大きな変更後に実行します。ContextDB、native/sync、release health などの確認を含みます。

RL のリリースゲート状態と推移を直接確認したい場合:

```bash
aios release-status --recent 12
aios release-status --strict
```

## Harness CLI に段階的に orchestration させたい

まず model call なしで preview:

```bash
aios orchestrate feature --task "Ship X" --dispatch local --execute dry-run
```

live 実行するときだけ明示的に有効化:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli
aios orchestrate --session <session-id> --dispatch local --execute live
```

新規ユーザーは `aios team ...` を優先してください。`orchestrate live` は session、plan、preflight gate を理解しているメンテナー向けです。

単一焦点の変更タスクには、`bugfix` blueprint（3 ラウンド: plan → implement → review）を使用します：

```bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
```

## ブラウザ自動化を診断したい

```bash
aios internal browser doctor --fix
aios internal browser cdp-status
```

ページ操作に失敗したら、全体を再インストールする前に [トラブルシューティング](troubleshooting.md) を確認してください。

## secrets と config を守りたい

```bash
aios privacy read --file .env
```

`.env`、cookies、tokens、browser profiles をそのまま model に貼らないでください。Harness CLI Privacy Guard は read output を共有する前にマスクします。

## 選び方の目安

- **日常開発**: `codex` / `claude` / `gemini` / `opencode`
- **インストール/更新**: `aios`
- **ソロ夜間実行**: `aios harness run --objective "明朝の引き継ぎメモをまとめる" --worktree`
- **Agent Team (GroupChat)**: `aios team 3:codex "task"`（ラウンドベースの共有会話）
- **進捗**: `aios team status --watch`
- **納品前**: `aios quality-gate pre-pr --profile strict`
- **ブラウザ問題**: `aios internal browser doctor --fix`

---
title: HUD ユーザーガイド
description: エージェントセッションの監視に HUD（Heads-Up Display）を使用するための完全ガイド。
---

# HUD ユーザーガイド

HUD（Heads-Up Display）は、エージェントセッションの状態、dispatch 結果、改善機会をリアルタイムで可視化します。

## HUD の使用場面

- **長実行タスク**: エージェントを妨害せずに進捗を監視
- **失敗のデバッグ**: quality-gate 結果と hindsight 分析を確認
- **スキル改善**: skill candidate パッチを発見して適用
- **チーム調整**: 複数の同時セッションを追跡

## HUD モード

### Minimal モード

長実行セッションのウォッチに最適：
- 基本状態のみ表示
- 高速リフレッシュ（1 秒データポーリング）
- リソース使用を削減する適応間隔

```bash
aios hud --watch --preset minimal --fast
```

### Compact モード

ターミナルフレンドリーな要約：
- セッション目標
- Dispatch 要約
- Quality-gate 状態

```bash
aios hud --preset compact
```

### Focused モード (デフォルト)

ほとんどのユースケースに適したバランス：
- すべての compact 情報
- 最近の dispatch artifacts
- Skill candidate hints

```bash
aios hud --preset focused
```

### Full モード

完全診断：
- すべての focused 情報
- 完全な hindsight 分析
- Quality-gate 詳細
- Fix hints と推奨事項

```bash
aios hud --preset full
```

## 基本的な使い方

### 現在のセッションを表示

```bash
# デフォルト focused ビュー
aios hud

# プロバイダー指定
aios hud --provider claude
aios hud --provider gemini
```

### ウォッチモード

```bash
# 継続的監視（1 秒リフレッシュ）
aios hud --watch

# カスタム間隔（ミリ秒）
aios hud --watch --interval-ms 2000

# 適応間隔付きファストモード
aios hud --watch --fast
```

### セッション指定

```bash
# セッション ID で
aios hud --session <session-id>
```

### JSON 出力

```bash
# 機械可読出力
aios hud --json

# jq でフィルタリング
aios hud --json | jq '.selection.qualityGate'
```

## Skill Candidate 機能

### Skill Candidates を表示

```bash
# HUD にcandidates をインライン表示
aios hud --show-skill-candidates

# 詳細ビュー（candidates のみ、HUD なし）
aios hud --show-skill-candidates --skill-candidate-view detail

# 候補数を制限（1-20）
aios hud --show-skill-candidates --skill-candidate-limit 10
```

### Skill Candidate ビューモード

**Inline（デフォルト）**：Candidates は HUD の下に表示

```
═══════════════════════════════════════
HUD 状態
═══════════════════════════════════════
Session: abc123
Goal: ユーザー認証を実装
Status: running | dispatch=ok | quality=ok
...

───────────────────────────────────────
Skill Candidates (3)
───────────────────────────────────────
[1] skill-candidate-001
    Scope: authentication
    Failure: token-validation-edge-case
    Lessons: 2
    Patch: 期限切れトークンに再試行ロジックを追加

[2] skill-candidate-002
    ...
```

**Detail**：candidates のみ表示（HUD は非表示）

```bash
aios hud --show-skill-candidates --skill-candidate-view detail
```

### パッチテンプレートをエクスポート

```bash
# デフォルト場所にエクスポート
aios hud --export-skill-candidate-patch-template

# 特定の draft ID フィルター付きでエクスポート
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>

# カスタム candidate 制限でエクスポート
aios hud --export-skill-candidate-patch-template --skill-candidate-limit 5
```

**出力先**: `memory/context-db/sessions/<session-id>/artifacts/skill-candidate-patch-template-<timestamp>.md`

### Draft ID でフィルター

```bash
# 特定の draft からの candidates のみ表示
aios hud --show-skill-candidates --draft-id <draft-id>

# フィルター済み candidates をエクスポート
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>
```

## Quality-Gate 統合

### Quality-Gate 状態を表示

HUD は quality-gate 結果を自動的に表示します：

```bash
# 完全ビューには quality 詳細が含まれる
aios hud --preset full

# プログラムアクセス用の JSON 出力
aios hud --json | jq '.selection.qualityGate'
```

### Quality カテゴリでフィルター

```bash
# HUD では直接サポートされていません - team history を使用
aios team history --quality-category clarity --limit 5
```

## パフォーマンスチューン

### ファストウォッチモード

長実行セッションの監視に最適化：

```bash
# Minimal preset + fast mode = 最小オーバーヘッド
aios hud --watch --preset minimal --fast

# データリフレッシュ: 1 秒（最小）
# レンダー間隔: 適応型（アクティビティ based 1 秒 -10 秒）
```

### カスタムリフレッシュ間隔

```bash
# バックグラウンド監視用のより遅いリフレッシュ
aios hud --watch --interval-ms 5000

# 適応間隔（セッションアクティビティに基づいて自動調整）
aios hud --watch --adaptive-interval
```

### 並行制御

HUD はデフォルトでセッションデータを逐次読み取り。複数セッションの場合：

```bash
# 単一セッション HUD には適用不可
# 複数セッションビューには team status を使用
```

## ウォッチモードのベストプラクティス

### ターミナル管理

```bash
# tmux ペインで永続監視として実行
tmux new-session -a -s aios-hud 'aios hud --watch'

# ターミナル分割: agent 上、HUD 下
tmux split-window -v
# 上ペイン: agent 実行
# 下ペイン: aios hud --watch --preset minimal
```

### 通知統合

```bash
# quality-gate 失敗時にアラート（terminal-notifier の例）
aios hud --watch --json | while read line; do
  echo "$line" | jq -r '.selection.qualityGate.outcome' | grep -q failed && \
    osascript -e 'display notification "Quality gate failed!" with title "AIOS HUD"'
done
```

### ログ相関

```bash
# HUD タイムスタンプを agent ログと関連付け
aios hud --watch | ts '[%Y-%m-%d %H:%M:%S] HUD: '
```

## トラブルシューティング

### HUD に古いデータが表示される

```bash
# ウォッチを再起動して強制リフレッシュ
# HUD はパフォーマンスのためにデータをキャッシュ

# データリフレッシュ間隔を確認
aios hud --watch --interval-ms 500
```

### Skill Candidates が表示されない

考えられる理由:
- セッションが選択されていない（`--session` を使用）
- セッションに quality-gate 失敗がない
- セッションがすべての quality チェックをパスした
- Learn-eval がまだ実行されていない

```bash
# quality-gate 失敗を確認
aios hud --json | jq '.selection.qualityGate'

# learn-eval が実行されたか確認
aios hud --json | jq '.selection.dispatchHindsight'
```

### JSON 出力解析の問題

```bash
# JSON 構造を検証
aios hud --json | jq .

# 特定のフィールドにアクセス
aios hud --json | jq '.selection.sessionId'
aios hud --json | jq '.selection.dispatch.jobCount'
aios hud --json | jq '.selection.qualityGate.outcome'
```

## 例

### ビルドパイプラインの監視

```bash
# バックグラウンドでビルドを開始し、HUD で監視
aios orchestrate --live &
aios hud --watch --preset minimal --fast
```

### 失敗セッションのデバッグ

```bash
# 失敗セッションの完全な詳細を表示
aios hud --session <failed-session-id> --preset full

# パッチ用に skill candidates をエクスポート
aios hud --session <failed-session-id> --export-skill-candidate-patch-template
```

### マルチセッションダッシュボード

```bash
# 複数の provider を同時に監視
# ターミナル 1
aios hud --provider codex --watch --preset minimal

# ターミナル 2
aios hud --provider claude --watch --preset minimal

# ターミナル 3（集約ビュー）
aios team status --watch --preset minimal
```

## 関連ドキュメント

- [Team Ops](team-ops.md) - Team Operations の概要
- [Skill Candidates](skill-candidates.md) - パッチの理解と適用
- [ContextDB](contextdb.md) - セッションストレージ

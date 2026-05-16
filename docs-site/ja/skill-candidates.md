---
title: Skill Candidates ガイド
description: 失敗したセッションからスキル改善パッチを発見、レビュー、適用する方法。
---

# Skill Candidates ガイド

**Skill Candidates** は、失敗した agent セッションから自動的に抽出される改善提案です。エラーから学習することで、AI アシスタントの能力を継続的に改善できます。

## 什么是 Skill Candidates？

Agent セッションが quality-gate チェックに失敗すると、AIOS は自動的に：
1. 失敗パターンを分析
2. 根本原因を特定（例：エラーハンドリングの欠落、エッジケース）
3. スキルパッチ草案を生成
4. **スキル候補**としてレビュー用に提示

### フロー例

```
セッション失敗 → Learn-eval が分析 → スキル候補が生成 → レビュー → パッチ適用 → スキル改善
```

## Skill Candidate 構造

各スキル候補には以下が含まれます：

| フィールド | 説明 |
|-----------|------|
| `skillId` | パッチ対象スキル |
| `scope` | 機能エリア（例：「authentication」「file-ops」） |
| `failureClass` | 遭遇した失敗タイプ |
| `lessonKind` | 改善タイプ（例：「error-handling」「edge-case」） |
| `lessonCount` | 学んだ教訓の数 |
| `patchHint` | 提案されたコード/テキスト変更 |
| `sourceDraftTargetId` | 元の draft ID |
| `reviewStatus` | Pending/Approved/Rejected |

## Skill Candidates の表示

### HUD から

```bash
# セッション状態とインラインで候補を表示
aios hud --show-skill-candidates

# 詳細ビュー（候補のみ、HUD なし）
aios hud --show-skill-candidates --skill-candidate-view detail

# 結果の制限
aios hud --show-skill-candidates --skill-candidate-limit 5
```

### Team Status から

```bash
# すべての最近の候補を表示
aios team status --show-skill-candidates

# セッションでフィルター
aios team status --session <session-id> --show-skill-candidates

# アーティファクトファイルにエクスポート
aios team status --export-skill-candidate-patch-template
```

### list コマンド

```bash
# 現在のセッションの候補をリスト
aios team skill-candidates list

# 特定のセッションのリスト
aios team skill-candidates list --session-id <session-id>

# JSON 出力
aios team skill-candidates list --json
```

### Draft ID でフィルター

```bash
# 特定の draft からの候補のみ表示
aios team skill-candidates list --draft-id <draft-id>

# フィルター済み候補をエクスポート
aios team skill-candidates export --draft-id <draft-id>
```

## パッチのエクスポート

### アーティファクトファイルにエクスポート

```bash
# デフォルトの場所（セッションアーティファクトフォルダー）
aios team skill-candidates export

# カスタム出力パス
aios team skill-candidates export --output-path ./patches/my-fix.md

# draft フィルター付き
aios team skill-candidates export --draft-id <draft-id> --output-path ./draft-patch.md
```

### エクスポート形式

エクスポートされたパッチテンプレートには以下が含まれます：
- 候補メタデータ（スキル ID、scope、failure class）
- 教訓の説明
- 提案されたパッチ内容
- 適用手順

## パッチの適用

### レビュープロセス

**任意のパッチを適用する前に：**
1. failure class を読む — 何が問題だったか理解
2. 教訓をレビュー — 何を得たか
3. patch hint を調べる — 提案された変更
4. パッチがスキルバージョンに適用可能か確認

### apply コマンド

```bash
# 特定の候補を適用
aios skill-candidate apply <candidate-id>

# レビューモードで適用
aios skill-candidate apply <candidate-id> --review

# dry-run（変更のプレビュー）
aios skill-candidate apply <candidate-id> --dry-run
```

### 一括適用

```bash
# スキルのすべての保留中候補を適用
aios skill-candidate apply-all --skill <skill-id>

# 承認付きで適用
aios skill-candidate apply-all --skill <skill-id> --approve
```

## Skill Candidate ワークフロー

### ステップ 1: 候補を発見

```bash
# 失敗したセッションの後、候補を確認
aios hud --session <failed-session-id> --show-skill-candidates
```

### ステップ 2: 候補をレビュー

```bash
# 詳細なレビュー用に詳細ビュー
aios hud --session <session-id> --show-skill-candidates --skill-candidate-view detail

# オフラインレビュー用にエクスポート
aios team skill-candidates export --session-id <session-id>
```

### ステップ 3: パッチをローカルでテスト

```bash
# テストブランチを作成（git を使用する場合）
git checkout -b skill-patch-<skill-id>

# 手動でパッチを適用するか apply コマンドを使用
aios skill-candidate apply <candidate-id>

# テストを実行して確認
npm test
```

### ステップ 4: 承認または却下

```bash
# パッチが動作する場合 — 承認
aios skill-candidate review <candidate-id> --approve

# パッチに問題がある場合 — フィードバックで却下
aios skill-candidate review <candidate-id> --reject --comment "エッジケース X を処理しない"
```

## ベストプラクティス

### 優先順位付け

**この順序で候補を適用：**
1. 高頻度の失敗（同じ failure class が複数回出現）
2. 重要パスのスキル（認証、セキュリティ、データの整合性）
3. 簡単な成果（単一行の修正、明確な改善）

### レビュ_guideline

- **レビューなしでは自動適用しない** — 各パッチは人間の検証が必要
- **分離してテスト** — パッチが既存の機能を壊さないか確認
- **競合を確認** — 複数パッチが同じコードを変更している可能性
- **決定を文書化** — 承認/却下の理由を記録

### 過学習の回避

- 1 回限りのエッジケースのパッチは適用しない
- 複数のセッション間でパターンを見つける
- 具体的な回避策より一般的な解決策を優先

## Learn-Eval との統合

Learn-eval はスキル候補を生成するシステムです：

```bash
# 最近のセッションを分析するために learn-eval を実行
aios learn-eval --limit 10

# スキル候補を含む draft 推奨事項を表示
```

### Learn-Eval 出力

```
Dispatch Hindsight Analysis:
- 分析されたペア: 15
- 繰り返されたブロックターン: 3
- 回帰: 1
- 上位 failure class: token-validation-edge-case

Draft 推奨事項:
[fix] skill-candidate-001
    スキル: authentication-handler
    Scope: token-validation
    Failure: edge-case-expired-token
    Lessons: 2
    Patch: 期限切れトークンの再試行ロジックを追加...
```

## Quality-Gate 接続

スキル候補は quality-gate が失敗したときに生成されます：

### Quality-Gate 結果

| 結果 | 説明 |
|------|------|
| `ok` | セッション合格 — 候補は生成されない |
| `failed` | セッション失敗 — 候補が生成された可能性 |
| `retry-needed` | リトライ必要 — 候補が生成される可能性 |

### 失敗カテゴリ

候補をトリガーする一般的な quality-gate 失敗カテゴリ：
- `clarity-needs-input` — Agent が更なるユーザー入力を必要とする
- `sample.latency-watch` — パフォーマンス問題
- `dispatch.blocked` — ジョブ実行がブロックされた
- `evidence.missing` — 検証証拠の欠落

## トラブルシューティング

### 失敗セッション後に候補がない

考えられる理由：
- learn-eval がまだ実行されていない
- 失敗がスキル改善機会として分類されなかった
- セッションが quality-gate チェック閾値に合格しなかった

```bash
# 手動で learn-eval をトリガー
aios learn-eval --session <session-id>

# quality-gate 状態を確認
aios hud --json | jq '.selection.qualityGate'
```

### 候補パッチが適用できない

理由：
- ターゲットスキルが候補生成後に変更された
- パッチ形式が現在のスキル構造と互換性がない
- 競合する変更

```bash
# 候補ソースバージョンを確認
aios team skill-candidates list --json | jq '.[0].sourceArtifactPath'

# 現在のスキルと比較
diff <(cat <source-artifact>) <(cat <current-skill-file>)
```

### 競合する複数の候補

複数の候補が同じスキルを変更する場合：
1. まずすべての候補をレビュー
2. 優先順位順（頻度、重大度）に適用
3. 各適用後にテスト
4. 競合する重複を却下

```bash
# スキルのすべての候補をリスト
aios team skill-candidates list --json | \
  jq '[.[] | select(.skillId == "target-skill-id")]'
```

## 高度な使用法

### プログラムによるアクセス

```bash
# 候補を JSON で取得
aios team skill-candidates list --json > candidates.json

# failure class でフィルター
cat candidates.json | \
  jq '[.[] | select(.failureClass == "token-validation-edge-case")]'

# スキルごとにカウント
cat candidates.json | \
  jq 'group_by(.skillId) | map({skill: .[0].skillId, count: length})'
```

### カスタム分析

```bash
# 時間経過、失敗パターンを分析
aios team history --quality-failed-only --json | \
  jq '[.[] | .skillCandidate] | group_by(.skillId)'

# 最も一般的な failure class を検索
aios team history --json | \
  jq '[.[] | .skillCandidate.failureClass] | unique'
```

## 関連ドキュメント

- [Team Ops](team-ops.md) — Team Operations の概要
- [HUD ガイド](hud-guide.md) — HUD でのセッション監視
- [ContextDB](contextdb.md) — セッションストレージとアーティファクト
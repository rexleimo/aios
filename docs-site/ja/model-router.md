---
title: モデルルーター
description: 各タスクに適切な AI モデルを自動的に選択 - 自分で考える必要がありません。
---

# モデル路由器

**異なる AI モデルは異なることに長けています。** モデルルーターは各タスクを最も得意なモデルに自動的に送信します。

フロントエンド作業？Kimi K2.6 を使用。セキュリティレビュー？Claude Opus を使用。ブラウザ自動化？GPT-5.5 を使用。路由器がタスク説明から判断するので、暗記する必要はありません。

## シンプルバージョン

```bash
# タスクを最適なモデルにルーティング
node scripts/aios.mjs model-router route \
  --task "美しいランディングページコンポーネントを構築" \
  --explain

# 結果: frontend → kimi-k2.6（「ランディングページ」「コンポーネント」「美しい」を検出）
```

以上就是路由器がタスクを読み取り、信号を検出し、最適なモデルを選定します。

## なぜこれが重要か

モデルルーターがなければ、以下のが必要です：

1. 各タスクタイプに最適なモデルを知道她
2. `codex`、`claude`、`gemini` コマンド間で手動切り替え
3. 各 CLI の正しいモデルフラグを暗記

モデル路由器があれば、タスクを説明するだけで 나머지가自動的に処理されます。

## 動作原理

```
タスク説明
    ↓
信号検出（「browser」「security」「frontend」などのキーワード）
    ↓
タスクタイプ分類（browser-automation、code-review など）
    ↓
モデル選択（ルーティングプロファイルに基づく）
    ↓
CLI コマンド生成（codex/claude/gemini の正しいフラグ）
    ↓
実行 + 結果記録
```

## モデル能力レジストリ

| モデル | プロトコル | 得意分野 | コスト |
|------|----------|--------|------|
| **Claude Opus 4.7** | claude | コードレビュー、アーキテクチャ設計、セキュリティ監査 | 最高 |
| **Claude Sonnet 4.6** | claude | 日常開発、RAG、快速プロトタイピング | 中 |
| **GPT-5.5** | codex | オールラウンダー：自動化、推論、コード実行 | 最高 |
| **DeepSeek-V4-Pro** | claude | アルゴリズム実装、コアロジック、バッチ処理 | 最低 |
| **GLM-5.1** | claude | 数学推論、自律ループ、システムプランニング | 低 |
| **Kimi K2.6** | claude | マルチエージェント編成、フロントエンドUI、長時間実行 | 低 |
| **MiniMax-M2.7** | claude | 自己修復、本番障害復旧 | 低 |
| **Gemini-3-Pro** | gemini | マルチモーダル分析、長文ドキュメント研究、1Mコンテキスト | 中 |

## CLI プロトコル

| プロトコル | CLI | 使用者 |
|----------|-----|---------|
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | その他すべてのモデル |

Codex live worker は `--dangerously-bypass-approvals-and-sandbox`（旧 `--yolo` 相当）を既定で付与し、バックグラウンド subagent が approval/sandbox prompt で待ち続けるのを防ぎます。手動デバッグ時のみ `AIOS_SUBAGENT_CODEX_UNATTENDED=0` で無効化してください。

## ルーティングルール

| タスクタイプ | 優先モデル | フォールバックチェーン |
|-------------|----------|---------------------|
| コードレビュー | Claude Opus | GPT-5.5 → GLM-5.1 |
| セキュリティ監査 | Claude Opus | GPT-5.5 → GLM-5.1 |
| アーキテクチャ設計 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 実装 | DeepSeek-V4 | GPT-5.5 → Claude Sonnet |
| ブラウザ自動化 | GPT-5.5 | Kimi K2.6 → Claude Sonnet |
| リサーチ/研究 | Gemini-3-Pro | GPT-5.5 → Kimi K2.6 |
| プランニング | GLM-5.1 | GPT-5.5 → Claude Opus |
| テスト | Claude Sonnet | GPT-5.5 → DeepSeek-V4 |
| ドキュメント | Claude Sonnet | GPT-5.5 → Kimi K2.6 |
| フロントエンド/UI | Kimi K2.6 | GPT-5.5 → Claude Sonnet |
| 故障回復 | MiniMax-M2.7 | GLM-5.1 → GPT-5.5 |
| 汎用 | GPT-5.5 | Claude Sonnet → DeepSeek-V4 |

## ルーティングプロファイル

ルーティングの積極性をプロファイルで選択：

| プロファイル | 使用タイミング | 動作 |
|-------------|--------------|------|
| `balanced`（デフォルト） | ほとんどの作業 | 強い信号でモデルをアップグレード；通常のコーディングは安価に維持 |
| `premium` | リスクが高いまたは不明確なタスク | Opus や GPT-5.5 などの高いモデルをより積極的に使用 |
| `budget` | コスト重視の作業 | タスクが本当に強いモデルを必要がある場合を除いて安価なモデルを優先 |

```bash
# コマンドごとに使用
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# またはセッション用に設定
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## クイックスタート

### すべてのモデルを表示

```bash
node scripts/aios.mjs model-router list
```

### 説明付きでタスクをルーティング

```bash
node scripts/aios.mjs model-router route \
  --task "美しいランディングページコンポーネントを構築" \
  --profile balanced \
  --explain
```

### 特定のタスクタイプを強制

```bash
node scripts/aios.mjs model-router route \
  --task "データベース接続のリファクタリング" \
  --task-type implementation
```

### ディスパッチ履歴を表示

```bash
node scripts/aios.mjs model-router stats
```

## なぜこのモデルが選択されたか

任何 route コマンドに `--explain` を追加して理由を表示：

```json
{
  "resolvedType": "browser-automation",
  "modelId": "gpt-5.5",
  "confidence": 0.86,
  "matchedSignals": [
    { "taskType": "browser-automation", "signal": "browser", "weight": 8 }
  ],
  "why": ["Detected browser-automation signals: browser, upload"]
}
```

- **高信頼度** = 1 つのタスクタイプが明確に一致
- **複数の recommendedPhases** = タスクが複合的；より良いルーティングのために分割
- **matchedSignals** は正確にどのキーワードがルーティングをトリガーしたかを示す

## 環境変数による上書き

特定のモデルを強制したい場合：

```bash
# ロール別
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus

# タスクタイプ別
export AIOS_MODEL_BROWSER_AUTOMATION=gpt-5.5
export AIOS_MODEL_CODE_REVIEW=claude-opus

# ルーティングを完全に無効化（固定モデルを使用）
export AIOS_MODEL_ROUTER=0
```

## Agent 統合

### タスクルーティングによる誘導

モデルルーターは AIOS Task Router を介して Agent コンテキストに注入されます。`ctx-agent` 下で実行されるすべての Agent は自動的にモデルディスパッチの guidance を取得します。サブタスクがディスパッチされるとき、Agent は `model-router` skill を呼び出して最適なモデルを決定できます。

### オーケストレーターによる

Agent ロールカード（`.claude/agents/*.md`）には `preferredModel` フィールドが含まれ、オーケストレーターはディスパッチ時に自動的に解決します：

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

モデル解決の優先順位：**環境変数** > **preferredModel** > **model**（フォールバック）。

## 知覚フィードバックループ

各モデルディスパッチは ContextDB の `model.dispatch` イベントとして記録されます。知覚システムはタスクタイプ別にモデルの成功率为計算できます。未来のルーティング決定は：**能力マッチング × 歴史的成功率 × コスト**を総合的に考慮します。

## 設定ファイル

| ファイル | 用途 |
|------|---------|
| `memory/specs/model-registry.json` | モデル能力、ルーティングルール、CLIプロトコル設定 |
| `memory/specs/orchestrator-agents.json` | Agent ロール→preferredModel マッピング |
| `.claude/skills/model-router/SKILL.md` | Agent 呼び出し可能なセルフサービスルーティングスキル |
| `scripts/lib/model-router.mjs` | ルーターロジック：マッチング、フォールバック、CLIビルド、統計 |

## 一般的な質問

### すべてが DeepSeek にルーティングされるのはなぜ？

`balanced` プロファイルでは、通常の実装タスクは DeepSeek に送られます（。安価で良いため）。より強いモデルを欲しいタスクには `--profile premium` を使用してください。

### タスクが複数部分あり、1 つのモデルだけが取得されました

現時点では、複合タスクは 1 つのモデルを取得します。explain 出力の `recommendedPhases` を確認してください — 複数のタイプが表示された場合、作業を個別のタスクに分割してください。

### Agent Team でも使用できますか？

はい。Agent Team はデフォルトでモデル路由器を使用します — チームの各フェーズが自動的に最適なモデルにルーティングされます。

## 次のステップ

- [Agent Team](team-ops.md) — 自動ルーティングによるマルチエージェントコラボレーション
- [ContextDB](contextdb.md) — プロジェクトメモリ
- [Solo Harness](solo-harness.md) — 長時間実行のシングルエージェント作業
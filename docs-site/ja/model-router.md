---
title: モデルルーター
description: "モデルルーターは、タスク種別、ルーティングプロファイル、capability registry、フォールバック規則に基づいて適切な AI モデルを自動選択します。各モデルの得意分野や利用枠を覚えておく必要はありません。なぜその選択になったかは --explain で確認でき、必要なら手動で上書きできます。"
---

# モデル路由器

> **Quick Answer:** Model Router はタスクタイプ、routing profile、能力レジストリ、設定済みの fallback ルールからモデルを選びます。選択理由を確認するときは `--explain` を使い、コスト・遅延・能力のトレードオフが合わないときは profile か明示的な override を使ってください。

## まず explain 可能なルートを実行する

`--explain` を付けてルーティングし、選ばれたモデルと判断根拠を必ずレビューしてください。

**AI モデルごとに得意分野は違います。** モデルルーターはタスクタイプと capability レジストリを照合し、最も得意なモデルへ送ります。フロントエンドは **Claude Sonnet 5**、セキュリティ監査は **Claude Opus 5**、ブラウザ自動化は **GPT-6-Astra**。この対応はレジストリが持つので、暗記する必要はありません。

## シンプルバージョン

```bash
# タスクを最適なモデルにルーティング（タスクタイプは明示宣言）
node scripts/aios.mjs model-router route \
  --task "美しいランディングページコンポーネントを構築" \
  --task-type frontend \
  --explain

# 結果: frontend → claude-sonnet-5（クライアント claude / --model）
```

これだけです。ルーターはレジストリを照合し、クライアント契約で絞り、CLI 引数を組み立てます。

タスク本文からのキーワード推論は**行いません**。`signals.mjs` の North Star 制約どおり、ルーティング入力 (`taskType` / `intent`) は呼び出し側が明示的に宣言します。宣言がない場合は `general` に落ち、`--explain` の `why` に「Explicit task type selected: ...」または「No explicit task type or intent...」と記録されます。上流（solo / phase job / team role / CLI）がどう宣言するかが実際の設計ポイントです。

## なぜ重要か

モデルルーターがない場合、次にような事が必要になります：

1. タスクタイプごとに最適なモデルを把握する
2. `codex`、`claude`、`gemini` のコマンドを手動で切り替える
3. 各 CLI の正しいモデルフラグを記憶する

モデルルーターがあれば、タスクを説明するだけで残りは処理されます。

## 動作原理

```
明示的な宣言（--task-type / フェーズロール / チームロール / 環境変数）
    ↓
タスクタイプ解決（宣言がなければ general）
    ↓
Routing profile 調整（balanced / premium / budget）+ ロール上書き
    ↓
レジストリ照合（primary + fallback チェーン）
    ↓
クライアント契約（モデルプロトコル ∩ 起動クライアント）
    ↓
チャネル可用性フィルタ（有効時、実行時ファイル由来）
    ↓
CLI コマンド生成（codex / claude / gemini の正しいフラグ）
    ↓
実行 + 結果を model.dispatch として記録
```

## CLI プロトコル

プロトコル語彙は 4 種。モデルが宣言したプロトコルと起動クライアントが話せるプロトコルが交差して初めてその経路は実行可能です（下記「クライアント モデル ルーティング契約」参照）：

| プロトコル | リレーエンドポイント | 起動可能なクライアント |
|---|---|---|
| `openai-response` | `https://coding.rexai.top/openai/v1/responses` | codex, opencode |
| `openai-chat` | `https://coding.rexai.top/openai/v1/chat/completions` | hermes, opencode, pi |
| `claude` | `https://coding.rexai.top/claude/v1/messages` | claude, hermes, opencode, pi |
| `gemini` | `https://coding.rexai.top/gemini/v1beta/models/<model>:generateContent` | opencode |

Codex live worker は `--dangerously-bypass-approvals-and-sandbox`（旧 `--yolo` 相当）を既定で付与し、バックグラウンド subagent が approval/sandbox プロンプトで待ち続けるのを防ぎます。手動デバッグ時のみ `AIOS_SUBAGENT_CODEX_UNATTENDED=0` で無効化してください。

## モデル能力レジストリ

レジストリはルーティング規則が使うモデルと構造化された能力を保持します。完全な一覧は `node scripts/aios.mjs model-router` で確認できます。

| モデル | 使用可能なプロトコル | 得意分野 | コスト | コンテキスト |
|---|---|---|---|---|
| **Claude Opus 5** | `claude` | コードレビュー, アーキテクチャ設計, セキュリティ監査 | 最高 | 200K |
| **Claude Opus 4.8** | `claude` | コードレビュー, セキュリティ監査, 長文執筆 | 高 | 200K |
| **GPT-6-Astra** | `openai-response` | オールラウンダー, 汎用推論, ブラウザ自動化 | 最高 | 1M |
| **Claude Sonnet 4.6** | `claude` | 日常開発, 高速プロトタイピング, RAG | 中 | 200K |
| **GLM-5.2** | `claude`, `openai-chat` | 自律ループ, 長時間プランニング, 数学推論 | 低 | 200K |
| **Claude Opus 4.7** | `claude` | コードレビュー, アーキテクチャ設計, セキュリティ監査 | 最高 | 200K |
| **DeepSeek-V4-Pro** | `claude` | アルゴリズム実装, コアロジック, 長尺ログ分析 | 最低 | 1M |
| **Claude Sonnet 5** | `claude` | 日常開発, 高速プロトタイピング, フロントエンド UI | 中 | 200K |
| **DeepSeek-V4-Flash** | `openai-chat`, `claude` | アルゴリズム実装, バッチ処理, 長尺ログ分析 | 最低 | 1M |
| **GPT-5.5** | `openai-response` | 汎用推論, ブラウザ自動化, デスクトップ自動化 | 最高 | 1M |
| **Gemini-3.8-Flash** | `gemini` | マルチモーダル分析, 長文ドキュメント研究, 動画分析 | 中 | 1M |
| **GPT-5.6-Sol** | `openai-response` | 汎用推論, 長時間実行, コード実行 | 高 | 1M |
| **Claude Haiku 4.5** | `claude` | 分類, 要約, バッチ処理 | 低 | 200K |
| **GLM-5.3-Flash** | `openai-chat` | 分類, ドキュメント, テスト実行 | 最低 | 200K |
| **Kimi K2.6** | `claude` | マルチエージェント編成, 長時間実行, フロントエンド UI | 低 | 200K |
| **MiniMax-M2.7** | `claude` | 自己修復, 本番復旧, 継続最適化 | 低 | 200K |

## ルーティングルール

| タスクタイプ | 優先モデル | フォールバックチェーン |
|---|---|---|
| `code-review` | **Claude Opus 5** | Claude Opus 4.8 → GPT-6-Astra → Claude Sonnet 4.6 |
| `security-review` | **Claude Opus 5** | Claude Opus 4.8 → GPT-6-Astra → GLM-5.2 |
| `architecture` | **Claude Opus 5** | GPT-6-Astra → GLM-5.2 → Claude Opus 4.7 |
| `implementation` | **DeepSeek-V4-Pro** | GPT-6-Astra → Claude Sonnet 5 → DeepSeek-V4-Flash |
| `browser-automation` | **GPT-6-Astra** | GPT-5.5 → Claude Sonnet 5 |
| `research` | **Gemini-3.8-Flash** | DeepSeek-V4-Pro → Claude Sonnet 5 → GPT-5.6-Sol |
| `planning` | **GLM-5.2** | GPT-6-Astra → Claude Opus 5 → Claude Opus 4.7 |
| `testing` | **Claude Haiku 4.5** | Claude Sonnet 5 → GLM-5.3-Flash → DeepSeek-V4-Flash |
| `docs` | **Claude Sonnet 5** | GLM-5.3-Flash → GPT-5.5 → Kimi K2.6 |
| `frontend` | **Claude Sonnet 5** | GPT-5.6-Sol → Kimi K2.6 → GPT-5.5 |
| `self-healing` | **GLM-5.2** | GPT-6-Astra → MiniMax-M2.7 → DeepSeek-V4-Pro |
| `general` | **GPT-6-Astra** | Claude Sonnet 5 → GLM-5.2 → DeepSeek-V4-Pro |

## ルーティングプロファイル

モデル選択の積極度を制御します：

| プロファイル | 使用タイミング | 動作 |
|---|---|---|
| `balanced`（デフォルト） | ほとんどの作業 | 強いスキルが重なった時だけ上位モデルへアップグレードし、通常のコーディングは安価に維持 |
| `premium` | リスクが高い、または不明確なタスク | Opus や GPT-6-Astra のような上位モデルを積極採用 |
| `budget` | コスト重視の作業 | タスクが本当に上位モデルを必要とする場合を除き最安モデルを優先 |

```bash
# コマンドごとに指定
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# またはセッション中に設定
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## クイックスタート

### レジストリとルールを表示

```bash
node scripts/aios.mjs model-router
```

### 説明付きでタスクをルーティング

```bash
node scripts/aios.mjs model-router route \
  --task "美しいランディングページコンポーネントを構築" \
  --task-type frontend \
  --profile balanced \
  --explain
```

### タスクタイプを明示宣言する

```bash
node scripts/aios.mjs model-router route \
  --task "データベース接続のリファクタリング" \
  --task-type implementation
```

### ディスパッチ履歴を表示

```bash
node scripts/aios.mjs model-router stats
```

### チャネル可用性の状態を表示

```bash
node scripts/aios.mjs model-router availability
```

## なぜこのモデルが選択されたか

任意の route コマンドに `--explain` を追加して理由を確認します：

```json
{
  "resolvedType": "implementation",
  "modelId": "deepseek-v4",
  "model": "DeepSeek-V4-Pro",
  "clientId": "claude-code",
  "reason": "primary match for taskType=\"implementation\"",
  "profile": "premium",
  "confidence": 1,
  "matchedSignals": [],
  "why": ["Explicit task type selected: implementation"],
  "contractMode": "",
  "modelProtocols": ["claude"],
  "requestedModelId": "deepseek-v4",
  "skippedForCapability": []
}
```

- **`resolvedType`** = 宣言から解決したタスクタイプ。キーワード推論の証拠ではない
- **`matchedSignals: []`** = ルーターは自由文からタスクタイプを推測しない（`signals.mjs` の North Star 制約）
- **`why`** = 明示宣言か、宣言がない場合の `general` 決定論的フォールバックかを説明する
- **`requestedModelId` / `skippedForCapability` / `contractMode`** = クライアント契約による絞り込みの痕跡

## モデル選択を上書きする

特定のモデルを強制したい場合：

```bash
# ロール別（planner / implementer / reviewer / security-reviewer）
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTER=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus

# プロファイル別
export AIOS_MODEL_ROUTER_PROFILE=budget

# ルーティング自体は無効化（各クライアントのデフォルトモデルを使用）
export AIOS_MODEL_ROUTER=0
```

上書きを指定した場合、ルーターはモデルを通すのではなく、そのモデルを話せるクライアントへ切り替えます。自動ルーティングのみがクライアントに合わせてモデルを入れ替えます。

## 設定ファイル

| ファイル | 用途 |
|---|---|
| `scripts/lib/specs/model-registry.json` | モデル能力、ルーティング規則、CLI プロトコル設定 |
| `scripts/lib/specs/orchestrator-agents.json` | Agent ロール → preferredModel マッピング（schema v2） |
| `.claude/skills/model-router/SKILL.md` | Agent からセルフサービスルーティングを呼ぶための skill |
| `.claude/agents/*.md` | preferredModel frontmatter を含む Agent ロールカード |
| `scripts/lib/model-router.mjs` | ルーターロジック：照合、fallback、CLI ビルド、統計 |

## Agent 統合

### タスクルーティングによる誘導

モデルルーターは AIOS Task Router 経由で Agent コンテキストに注入されます。`ctx-agent` 配下で実行される Agent は自動的にモデルディスパッチの指針を得ます。サブタスクをディスパッチする際、Agent は `model-router` skill を呼んで最適なモデルを決められます。

### オーケストレーターによる

Agent ロールカード（`.claude/agents/*.md`）の `preferredModel` をオーケストレーターがディスパッチ時に解釈します：

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

モデル解決優先度：**環境変数** > **preferredModel** > **model**（フォールバック）。

## 知覚フィードバックループ

各ディスパッチは ContextDB の `model.dispatch` イベントとして記録され、タスクタイプ別に成功確率を集計します。将来の判断は **能力適合 × 履歴成功率 × コスト** を一緒に考慮します。

## クライアント モデル ルーティング契約

実際に起動するクライアントがそのプロトコルを話せなければ、ルーティングに意味はありません。AIOS は推測せずクライアント登録表（`scripts/lib/clients/core/definitions.mjs`）から読みます：

| クライアント | `modelRouting` | 話せるプロトコル | モデル引数 |
|---|---|---|---|
| codex | `relay` | `openai-response` | `-m` |
| claude | `relay` | `claude` | `--model` |
| gemini | `own` | _未公開_ | `-m` |
| opencode | `relay` | `openai-chat`, `openai-response`, `claude`, `gemini` | `-m` |
| hermes | `relay` | `claude`, `openai-chat` | `--model` |
| grok | `own` | _未公開_ | `-m` |
| workbuddy | `own` | _未公開_ | `--model` |
| pi | `relay` | `openai-chat`, `claude` | `--model` |
| zcode | `own` | _未公開_ | `—` |

- `relay`: ネイティブプロトコルのゲートウェイ型 CLI。`coding.rexai.top` に向ければキュレーション済みモデルを利用できます。
- `own`: モデル引数を一切渡さず、クライアント自身のデフォルトを使います。AIOS は設定を書き換えません。
- `hermes` は `openai-chat` 上流を終端できますが、起動は Anthropic 互換チャネルのみなので `claude` + `openai-chat` を宣言します。

プロトコルとエンドポイントの対応は `scripts/lib/model-router/protocols.mjs`：`openai-chat -> /openai/v1/chat/completions`、`openai-response -> /openai/v1/responses`、`claude -> /claude/v1/messages`、`gemini -> /gemini/v1beta/models/<model>:generateContent`。

ここから 2 つの規則が決まります：

- **明示宣言を優先。** `-m`、`AIOS_MODEL_*`、タスクモデルが設定されたらクライアントがモデルに付いていきます（provider クライアント + その `--model` チャネル）。worker クライアントに合わせるためにモデルを替えてよいのは自動ルーティングだけです。
- **自動ルーティングはクライアントを替えない。** team ロール、subagent、phase job はタスクが指定したクライアントで起動します。そのクライアントが最適モデルを話せないなら、使える最強モデルまでフォールバックチェーンを下がります。

判断はすべてルート結果に残ります：`requestedModelId`（元の要求）、`skippedForCapability`（候補を飛ばした理由）、`modelProtocols`、`contractMode`。

## チャネル可用性（ランタイム層）

レジストリはモデルの得意分野を表し、もう一つの状態機械は中継地点が**今**提供できるかを記録します。学習元は実際のディスパッチ結果だけです：

| 現象 | 記録内容 |
|---|---|
| `model_not_found`、`no available channel`、ゲートウェイ応答の切り詰め、プローブ HTTP 404 | チャネル `down`（404 は即死判定） |
| 接続・タイムアウト・reset、5xx、初回バイト前の断流 | `network` 失敗 |
| 実際のモデルと違う id が返った | `degraded`（チャネルが不安定） |
| 初回バイトが遅延予算を超過 | `degraded` |
| 連続 2 回失敗 | `down` |
| 成功 | 復経路を通って `ok` に戻す |

Agent 側の失敗（`tool`、`provider-output`、`timeout-after-output`）はチャネルの証拠として**記録しません**。worker が道具を誤使ってもモデルを冷やしません。

確認方法：`node scripts/aios.mjs model-router availability`。ルーティングは既定でこのキャッシュを読みません（オフラインで決定論的に保つため）。`AIOS_MODEL_AVAILABILITY=1` で初めて unusable チャネルを除外し、適用結果は `orchestrate plan preview` とフェーズ dispatch イベントの `channelDown` / `degradedChannel` に現れます。`down` は `cooldownMs`（既定 300 秒）で自動復帰、`ok` は `ttlMs`（既定 600 秒）超で失効。キャッシュは `memory/specs/model-availability.json`（`AIOS_MODEL_AVAILABILITY_PATH` で上書き、`AIOS_MODEL_AVAILABILITY_FEEDBACK=0` で書き戻し無効）。

## 次のステップ

- [Agent Team](team-ops.md) — 自動ルーティングによるマルチエージェント協調
- [ContextDB](contextdb.md) — プロジェクトメモリ
- [Solo Harness](solo-harness.md) — 長時間実行の単一エージェント作業

## FAQ

### モデルを選ぶ前にモデルを呼び出しますか？

いいえ。ルーターはタスクメタデータと設定済み能力レジストリで client/model 経路を選び、その後で選択されたクライアントがタスクを実行します。

### 推奨結果を上書きできますか？

できます。コスト、遅延、能力要件に応じて routing profile かロール別の明示 override を使ってください。

### なぜ実装タスクはいつも安価なモデルになるのか

`balanced` では `implementation` が安価な DeepSeek-V4 に決まります。上流が強いスキル合流を見るか `--profile premium` を使えば上位モデルへ上がります。

### タスクに複数の部分があり、1 つのモデルしか返らない

複合タスクは現在 1 モデルです。explain 出力の `recommendedPhases` を確認し、複数タイプなら個別タスクに分割してください。

### Agent Team でも使えますか？

使えます。Agent Team は既定でモデルルーターを使い、チームの各フェーズが自動的に最適なモデルへルーティングされます。

## 正規ドキュメント

完全な実行契約を理解するには [Agent Team](team-ops.md)、[ワークフローストラテジー](workflow-policy.md)、[ContextDB](contextdb.md) を併読してください。

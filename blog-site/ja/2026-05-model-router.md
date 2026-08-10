---
title: "Model Router: どの AI モデルを使うか、もう悩まない"
description: "タスクの説明を読んで、自動的に最適な AI モデルを選択するディスパッチレイヤー。モデルの得意分野を覚える必要はもうありません。"
date: 2026-05-08
tags: ["model-router", "マルチモデル", "Agent Team", "AIOS"]
---

# Model Router: どの AI モデルを使うか、もう悩まない

この感覚、知っていますよね: タスクがあるのに、どの AI モデルを使えばいいかわからない。Claude Opus？ DeepSeek？ GPT-5.5？ それぞれ得意分野が違うし、間違った選択をすると時間もお金も無駄になります。

**ルーティングが自動でできたらどうでしょう？**

Model Router はタスクの説明を読み取り、どんな種類の作業かを検出して、その作業に最も適したモデルに送ります。

## 解決する課題

Model Router なしでは、ルーティングはこうなります:

| あなたの言葉 | どのモデル？ | なぜ？ |
|---|---|---|
| 「ランディングページを作って」 | ??? | フロントエンド？ UI？ デザイン？ |
| 「このコードをセキュリティレビューして」 | ??? | Claude Opus？ GPT-5.5？ |
| 「本番障害を直して」 | ??? | これはコーディングじゃなくて運用 |
| 「ログインエンドポイントを実装して」 | ??? | 多分 DeepSeek だけど、違うかも？ |

すべてのモデルの得意分野を覚えて、CLI を手動で切り替える必要があります。Model Router なら、タスクを説明するだけ:

```bash
node scripts/aios.mjs model-router route \
  --task "美しいランディングページコンポーネントを作る" \
  --explain
```

結果: `frontend → kimi-k2.6`（「ランディングページ」「コンポーネント」「美しい」がフロントエンド作業のシグナルだから）。

## どうやって選んでいるか

Model Router はタスク説明の中から **シグナル** を探します — あなたがどんな種類の作業をしているかを示すキーワードです:

| 言及した言葉 | 検出結果 | ルーティング先 | 理由 |
|---|---|---|---|
| 「browser」「upload」「screenshot」 | ブラウザ自動化 | GPT-5.5 | ツール利用推論に最も強い |
| 「security」「vulnerability」「auth」 | セキュリティレビュー | Claude Opus | 最も強力なレビューアー |
| 「frontend」「UI」「component」 | フロントエンド作業 | Kimi K2.6 | UI タスクに最も得意 |
| 「production」「incident」「logs」 | 自己修復 | MiniMax-M2.7 | 運用回復向けに設計 |
| 「長文ドキュメント」「research」 | リサーチ | Gemini-3-Pro | 1M コンテキストウィンドウ |
| 「implement」、通常のコーディング | 実装 | DeepSeek-V4 | 安くて速い |

任意の route コマンドに `--explain` を付けると、どのシグナルがマッチしたかとその理由が正確にわかります。

## Before/After

Balanced v2 ルーターで何が変わったか:

| タスク | Before（旧ルーター） | After（Balanced v2） |
|---|---|---|
| 「Xiaohongshu を開いて画像をアップロード」 | implementation → DeepSeek | browser-automation → GPT-5.5 |
| 「美しいランディングページを作って」 | implementation → DeepSeek | frontend → Kimi K2.6 |
| 「本番のログイン障害を直して」 | research → Gemini | self-healing → MiniMax-M2.7 |
| 「新しいログインエンドポイントを実装して」 | implementation → DeepSeek | implementation → DeepSeek（正しい！） |

重要なポイント: **通常の実装は安いまま**（DeepSeek）ですが、明らかに専門モデルが必要なタスクは自動的にアップグレードされます。

## ルーティングプロファイル

ルーティングの積極性を制御する3つのモード:

| プロファイル | 使うタイミング | 何が起きるか |
|---|---|---|
| `balanced`（デフォルト） | ほとんどの作業 | 強いシグナルはアップグレード、通常のコーディングは安いまま |
| `premium` | リスキーまたは不明なタスク | 高価なモデルを使う傾向が強い |
| `budget` | コスト重視の作業 | 本当に強いモデルが必要な場合以外は安いモデルを優先 |

```bash
# コマンドごとに指定
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# セッション全体に適用
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 試してみる

```bash
# 利用可能な全モデルを表示
node scripts/aios.mjs model-router list

# タスクをルーティングして理由を確認
node scripts/aios.mjs model-router route \
  --task "ここにタスクの説明を入力" \
  --profile balanced \
  --explain

# 最近のルーティング結果を表示
node scripts/aios.mjs model-router stats
```

## Agent Team と連携

Model Router は Agent Team に組み込まれています — チーム実行の各フェーズが自動的に最適なモデルにルーティングされます。設定は不要です。

---

*Model Router は [AIOS](https://cli.rexai.top) の一部です。全モデル、ルール、設定オプションについては[ドキュメント](https://cli.rexai.top/ja/model-router/)をご覧ください。*

## 関連ドキュメント

- [モデルルーター](https://cli.rexai.top/ja/model-router/)
- [Quick Start](https://cli.rexai.top/ja/getting-started/) — 30 秒で AIOS をインストール
- [Workflow Policy](https://cli.rexai.top/ja/workflow-policy/) — direct / guarded / planned ルート

---
title: 概要
description: まずやりたい作業からコマンドを選び、ContextDB、Agent Team、ブラウザ自動化、skills に進みます。
---

# RexCLI

> 今の習慣を変えずに、普段使っている `codex` / `claude` / `gemini` に記憶、協調、検証を追加します。

[3分クイックスタート](getting-started.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="quick_start" }
[Agent Team の使い方](team-ops.md){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="team_ops" }
[シナリオ別コマンド](use-cases.md){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="use_cases" }
[GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=ja_onboarding&utm_content=home_hero_star){ .md-button data-rex-track="cta_click" data-rex-location="home_hero" data-rex-target="github_star" }

<figure class="rex-visual">
  <img src="../assets/visual-new-user-path.svg" alt="RexCLI 初心者の3ステップ: Doctor、プロジェクト記憶、必要時だけ Agent Team">
  <figcaption>新規ユーザーは最短経路から始めます。インストール後に Doctor を実行し、プロジェクト記憶を有効化し、タスクが明確に分割できる時だけ Agent Team を使います。</figcaption>
</figure>

## コア機能

<div class="feature-grid">
  <a href="contextdb/" class="feature-card feature-card--memory">
    <div class="feature-card__icon">🧠</div>
    <div class="feature-card__title">ContextDB</div>
    <div class="feature-card__desc">プロジェクト全体の記憶レイヤー。イベント、checkpoint、context pack がターミナル再起動後も保持されます。</div>
    <span class="feature-card__link">詳細を見る →</span>
  </a>
  <a href="superpowers/" class="feature-card feature-card--workflow">
    <div class="feature-card__icon">⚡</div>
    <div class="feature-card__title">Superpowers</div>
    <div class="feature-card__desc">再利用可能な自動化スキル。ブレインストーミング、計画立案、デバッグ、検証、デプロイをガイド付きワークフローで。</div>
    <span class="feature-card__link">詳細を見る →</span>
  </a>
  <a href="team-ops/" class="feature-card feature-card--team">
    <div class="feature-card__icon">👥</div>
    <div class="feature-card__title">Agent Team</div>
    <div class="feature-card__desc">分割可能なタスクを複数の CLI worker に分散し、HUD で追跡。agents を協調させ、混沌を防ぎます。</div>
    <span class="feature-card__link">詳細を見る →</span>
  </a>
  <a href="solo-harness/" class="feature-card feature-card--tool">
    <div class="feature-card__icon">🌙</div>
    <div class="feature-card__title">ソロ Harness</div>
    <div class="feature-card__desc">長時間実行の単一 agent 作業に、run journal、resume/stop 制御、worktree 分離を提供。</div>
    <span class="feature-card__link">詳細を見る →</span>
  </a>
  <a href="debug-hub/" class="feature-card feature-card--debug">
    <div class="feature-card__icon">🐛</div>
    <div class="feature-card__title">debug-hub</div>
    <div class="feature-card__desc">MCP ネイティブのデバッグログサービス。coding agent が自身のランタイムログをクエリし、自己診断可能に。</div>
    <span class="feature-card__link">詳細を見る →</span>
  </a>
  <a href="model-router/" class="feature-card feature-card--memory">
    <div class="feature-card__icon">🧭</div>
    <div class="feature-card__title">Model Router</div>
    <div class="feature-card__desc">Agent Team に最適なモデルを自動選択。能力、コスト、成功率に基づくインテリジェントな振り分け。</div>
    <span class="feature-card__link">詳細 →</span>
  </a>
  <a href="troubleshooting/" class="feature-card feature-card--tool">
    <div class="feature-card__icon">🌐</div>
    <div class="feature-card__title">Browser MCP</div>
    <div class="feature-card__desc">ステルスブラウザ自動化（CDP）。人間の行動シミュレーションと検出回避を内蔵。</div>
    <span class="feature-card__link">詳細 →</span>
  </a>
</div>

## 注目: debug-hub

**coding agent に自己診断能力を。** debug-hub は agent 専用に設計された MCP ネイティブのデバッグログサービスです。ログとトレースを agent が直接クエリできるツールとして公開し、人間がターミナル出力を grep したりエラースパンを手動で関連付けたりする必要をなくします。

| | |
|---|---|
| **agent 用 MCP ツール** | `search_logs`、`get_trace`、`list_traces`、`get_stats`、`clear_logs` |
| **3 種類の SDK** | Node.js、Browser、Go — 一貫した API |
| **ゼロ依存** | `~/.debug-hub/` 配下のファイルストレージ、DB 不要、Docker 不要 |
| **組み込み Web UI** | ダークテーマのダッシュボード、SSE ライブフィード |

```bash
cd packages/debug-hub && npm install && npm run dev
# HTTP API + Web UI: http://localhost:39200、MCP は stdio
```

[お知らせ全文を読む →](/blog/ja/2026-05-debug-hub-mcp/){ .md-button .md-button--primary }
[クイックスタート](debug-hub.md){ .md-button }

## まず何をしたいか選ぶ

| 今やりたいこと | 先に読む | 最短コマンド |
|---|---|---|
| インストールして TUI を開く | [クイックスタート](getting-started.md) | `aios` |
| agent にプロジェクト文脈を覚えさせる | [ContextDB](contextdb.md) | `touch .contextdb-enable && codex` |
| **agent に自己診断させる** | **[debug-hub ブログ](/blog/ja/2026-05-debug-hub-mcp/)** | `cd packages/debug-hub && npm run dev` |
| 1つの agent を夜通し走らせる | [ソロ Harness](solo-harness.md) | `aios harness run --objective "明朝の引き継ぎメモをまとめる" --worktree` |
| 複数 agent で作業する | [Agent Team](team-ops.md) | `aios team 3:codex "X を実装し、テストを実行"` |
| 進捗を見る | [HUD ガイド](hud-guide.md) | `aios team status --provider codex --watch` |
| ブラウザ自動化を診断する | [トラブルシューティング](troubleshooting.md) | `aios internal browser doctor --fix` |

## RexCLI とは

RexCLI は新しい coding agent ではありません。ローカル優先の能力レイヤーです。

1. **記憶レイヤー ContextDB**: イベント、checkpoint、context pack を現在のプロジェクトに保存し、ターミナル再起動後も続きから作業できます。
2. **ワークフローレイヤー Superpowers**: 要件を計画に分解し、証拠ベースでデバッグし、完了前に検証します。
3. **協調レイヤー Agent Team**: 明確に分割できるタスクを複数 CLI worker に渡し、HUD で状態を追跡します。
4. **可観測レイヤー debug-hub**: agent のランタイムログとトレースを MCP ツールとして公開し、agent が自律的にエラーを診断できるようにします。
5. **ツールレイヤー Browser MCP + Privacy Guard**: agent がブラウザを使えるようにし、機密設定は共有前にマスクします。

単一 agent の長時間作業では、[ソロ Harness](solo-harness.md) が ContextDB の上に run journal、resume/stop 制御、必要に応じた worktree 分離を追加します。

つまり、あなたは引き続き `codex`、`claude`、`gemini` を実行します。RexCLI はそれらに記憶、協調、検証を足します。

## 新規ユーザーの推奨ルート

### 1日目: まず動かす

```bash
curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios
```

TUI で **Setup** を選び、その後 **Doctor** を実行します。

### Step 2: プロジェクトで記憶を有効化

```bash
cd /path/to/your/project
touch .contextdb-enable
codex
```

以後、このプロジェクトで `codex` / `claude` / `gemini` を起動すると、RexCLI が同じプロジェクト文脈へ接続します。

### Step 3: 分割できる時だけ Agent Team を使う

```bash
aios team 3:codex "ログインモジュールをリファクタし、完了前に関連テストを実行"
aios team status --provider codex --watch
```

タスクがまだ曖昧なら、まず通常の対話型 `codex` で分析します。明確に分割できる時だけ `team` を使ってください。

## よくある誤解

- **すべての作業に Agent Team は不要**: 単一ファイル修正、小さな bug、曖昧な要件は単一 agent から始めます。
- **初日に全環境変数を覚える必要はありません**: まず `aios` TUI を使ってください。
- **機能一覧から始めない**: 「今何をしたいか」からコマンドを選びます。
- **Doctor を飛ばさない**: install、browser、skills、native 設定を手で直す前に診断します。

## リリースノートと詳細記事

- [debug-hub: MCP ネイティブデバッグログサービス](/blog/ja/2026-05-debug-hub-mcp/): coding agent が MCP ツールで自身のランタイムログを直接クエリ可能に。
- [AIOS RL Training System](/blog/ja/rl-training-system/): multi-environment training control plane と rollout model。
- [ContextDB Search Upgrade](/blog/ja/contextdb-fts-bm25-search/): FTS5 + BM25 search path と semantic rerank behavior。
- [Windows CLI Startup Stability](/blog/ja/windows-cli-startup-stability/): wrapper startup fix と Windows launch reliability。
- [Orchestrate Live](/blog/ja/orchestrate-live/): live orchestration gates と execution workflow。

## 次に読む

- [クイックスタート](getting-started.md): install、Setup、Doctor、初回実行。
- [シナリオ別コマンド](use-cases.md): 作業別に入口を選ぶ。
- [Agent Team](team-ops.md): いつ team を使うか、どう監視し、どう完了するか。
- [ソロ Harness](solo-harness.md): 1つの agent を夜通し動かし、状態確認、停止、再開を行う方法。
- [ContextDB](contextdb.md): 記憶がセッションをまたいで残る仕組み。
- [トラブルシューティング](troubleshooting.md): install、browser、live 実行の問題。

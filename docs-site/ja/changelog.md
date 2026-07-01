---
title: 変更履歴
description: リリース履歴、アップグレード情報、関連ドキュメントへの入口。
---

# 変更履歴

## ドキュメントと workflow のメモ

- agent governance の説明を Team ドキュメント、シナリオガイド、ContextDB リファレンス、ブログに追加しました。
- 新しい smoke 証跡ガイドでは `.aios/agents/smoke/<agent>.json`、`.aios/agents/provenance/<agent>.json`、`.aios/interception/metrics/agents-smoke-<agent>.jsonl` を参照します。
- skill を変更したら、live workflow を信頼する前に `node scripts/aios.mjs skill verify-training --changed --base HEAD --json` を実行してください。
- **Hermes Agent が AIOS ファーストクラスクライアントに昇格**：Hermes (Nous Research) が 7 番目の AIOS クライアントとして登録され、skills、native、harness、superpowers の 4 能力を備えました。MCP ブリッジサーバー (`scripts/aios-mcp-server.mjs`) が Hermes セッション内で 5 つの AIOSツールを直接公開 — `aios_context_pack`、`aios_doctor_suite`、`aios_intercept_compress`、`aios_skill_validate`、`aios_skill_install`。詳細: [Hermes Agent + AIOS ブログ記事](/blog/ja/2026-06-hermes-agent-aios-client/)。

## v3.2.0（2026-07-01）— Harness 信頼性とスキルライフサイクル向上

### Harness Solo Runtime

- **consecutiveFailures 自動中止**：`backoff.mjs` にデュアルカウンター（`consecutiveFailures` + `consecutiveInfraFailures`）を追加。5 連続非成功 outcome で自動 abort、無限リトライによる token 無駄を防止。
- **Emergency 圧縮ティア**：`mermaid-canvas.mjs` に 3 番目の圧縮レベル（100+ ノードで発火）を追加。emergency モードは最近 5 ノードのみ保持し、canvas オーバーフローを防止。
- **Dry-run Readiness プレフライト**：新規 `dry-run-readiness.mjs` が harness 起動前に 4 次元（ContextDB、Git、Provider、Session）をチェック。`blocked` レベルは起動を阻止。

### Runtime Directive システム

- **Directive 注入**：新規 `directive-inject.mjs` が `.aios/config.json` の `default_mode` を読み、対応する `systemPromptAdditions` を毎回の harness 反復 prompt に注入。3 つの内蔵プリセットとカスタム `mode_presets` をサポート。

### Auto-Dream（Phase A: 手動）

- **手動メモリ整理 CLI**：`scripts/lib/memo/autodream.mjs` が `--preview`（計画のみ）と `--apply`（実行）モードを提供。既存の taxonomy + 重複排除 + TTL 期限切れパイプラインをラップ。

### Skill Workshop

- **Stale 検出**：apply 前にターゲット `SKILL.md` のファイルシステム hash と lock の `computedHash` を比較。不一致場合は apply を拒否し、ユーザーの手動編集を保護。
- **ファイルレベル rollback**：apply 前に完全な `SKILL.md` 内容を `lock.rollbackSnapshot.previousContent` に保存。rollback 時に実際のファイル内容を復元。

### 検証

全変更は 37/37 ユニット + 統合テストで検証済み。

詳細: [v3.2.0 リリース記事](/blog/ja/2026-07-v320-harness-reliability-upgrade/)。

## v3.1.0（2026-06-30）— Hermes Agent ファーストクラスクライアント統合

- **Hermes Agent が 7 番目の AIOS ファーストクラスクライアントとして登録**：skills、native、harness、superpowers の全機能を備える。
- **MCP ブリッジサーバー**：`scripts/aios-mcp-server.mjs` が Hermes セッション内で 5 つの AIOS ツール（`aios_context_pack`、`aios_doctor_suite`、`aios_intercept_compress`、`aios_skill_validate`、`aios_skill_install`）を公開。
- **Native emitter + MCP target**：AGENTS.md 出力 + JSON stdio（`.mcp.json` + `config.yaml` scopes）。
- 多言語ドキュメント対応（英/中/日/韓）。
- 詳細: [Hermes Agent + AIOS ブログ記事](/blog/ja/2026-06-hermes-agent-aios-client/)。

## v2.0.2 (2026-06-15)

- **Skill health validation**: `recordSkillObservation()` は未知の status を拒否し、producer の typo を failure として保存しないようになりました。
- **Help-first CLI parsing**: `aios skill ... --help` と `aios session ... --help` は必須位置引数の検証より先に usage を表示します。
- **Crush config hygiene**: `.crush.json` と `crush.json` は repository で tracking されなくなりました。local Crush config は引き続き利用できますが git では無視されます。
- 参考: [v2.0.2 release post](/blog/ja/2026-06-v202-ecc-uplift/).

## v2.0.1 (2026-06-13)

- **Browser MCP alias migration**: default browser-use runtime を保ったまま legacy alias compatibility を修正しました。

## v2.0.0 (2026-06-12)

- **Pull-based runtime context**: automatic ContextDB prompt injection と startup-mode injection を削除し、必要な時だけ runtime context を読み込む形にしました。

## v1.52.0 (2026-06-11)

- **aios_shell MCP ツール**: `aios-shell` MCP エイリアス経由で全クライアントにおいて決定論的な shell 出力圧縮を実現。shell コマンドは `scripts/shell-mcp-server.mjs` で実行され、MCP proxy が自動的に **99%+ の節約率** で圧縮します。
- **3層防御**: MCP ツール (全クライアント) → shim+hook (Claude/全クライアント) → プロンプト誘導。単一障害点なし。
- **Shim 自己修復**: ネイティブ shim が 4 つの fallback パスを探索し、fail-open で実際のクライアントバイナリを実行。
- **機密コマンドガード**: `git push` と `npm publish` が実行前に遮断され、ホスト権限確認が必要。
- **aios-shell 全クライアント登録**: `doctor --fix` で `.mcp.json`、`.codex/config.toml`、`.gemini/settings.json`、`opencode.json`、`crush.json` に登録。
- 参考: [v1.52.0 ブログ記事](/blog/ja/2026-06-v152-aios-shell-mcp/).

## v1.51.0 (2026-06-10)

- **Crush smoke 検証**: Crush (charmbracelet) を pending-smoke ゲーティングに追加し、live execution ブロックを強化。
- **Native strict モード強化**: `clients doctor --native-strict` が管理 shim の背後に実際のダウンストリームクライアントが存在するか検証。

## v1.50.1 (2026-06-05)

- **全クライアント turn compression compliance**: すべての AIOS-managed client/host が `bidirectional-turn-compression` metric を共有し、`pre_send` と `post_receive` を必須にしました。
- **Bypass で偽の節約をしない**: AIOS-managed runner 外の direct host output は `policy-violation` / `non_compliant` として記録され、`saved_bytes=0` になります。
- **Proof matrix**: `node scripts/aios.mjs interception proof --json` と `doctor --json` が Codex、Claude、Gemini、Antigravity、OpenCode、Crush、Cursor、`aios-harness`、`generic-mcp` の `turn_compression_matrix` を出力します。
- **Skill training evidence**: `aios-interception-runtime` は SkillOpt-Lite で training 済みで、artifact は `.skillopt/aios-interception-runtime-2026-06-05` にあります。
- **Release tutorial**: [v1.50.1 token compression compliance post](/blog/ja/2026-06-v1501-token-compression-compliance/) と [Native Token Compression](token-compression.md#all-client-turn-compression-v1501) を参照してください。

## v1.50.0（2026-06-04）

- **統合 AIOS 検索**：`node scripts/aios.mjs search "<query>"` で project memory、pinned memo、docs、plans、code を一度に検索できます。
- **クロス CLI の記憶安全性**：`project_shared` は全 client で見え、`agent_private` は一致する `--agent <runtime-client-id>` のみで見えます。
- **全 client への native guidance**：Codex/OpenCode/Crush は `AGENTS.md`、Claude は `CLAUDE.md`、Gemini/Antigravity は `GEMINI.md` で同じ search 指示を受け取ります。
- **リリース tutorial**：[v1.50.0 統合検索 tutorial](/blog/ja/2026-06-v150-unified-aios-search/) と [ContextDB](contextdb.md#統合プロジェクト検索v1500) を参照してください。

このページでは `Harness CLI` の変更点を追跡し、関連ドキュメントへ移動できます。

## 公式リリース履歴

[⭐ GitHub で Star](https://github.com/rexleimo/harness-cli){ .md-button .md-button--primary }
[📦 Releases を見る](https://github.com/rexleimo/harness-cli/releases){ .md-button }

## 最新安定版

- `1.17.0` (2026-05-16):
  - **Memo Storage**: `aios memo` は storage abstraction を使い、公開 implementation は `file`（既定の append-only JSONL: `.aios/memo/file/events.jsonl`）と `split`（memo event ごとに 1 JSON file）の 2 つです。`aios memo storage status`、`aios memo storage use split`、`aios memo storage use file`、`aios memo storage rebuild`、`aios memo storage doctor` で管理します。
  - **Git-friendly memo source of truth**: `.aios/memo/` が project memo の正規 root です。ContextDB/SQLite は互換 mirror と再構築可能 cache であり、memo source of truth ではありません。
  - **Runtime state alignment**: 新しい ContextDB runtime state は `.aios/context-db/` に書き込まれます。legacy `memory/context-db` は存在する場合のみ互換読み取り path として扱います。
  - 詳細は [ContextDB](contextdb.md#workspace-memoryaios-memo) の memo storage boundary を参照してください。

- `1.11.0` (2026-05-09):
  - **debug-hub v0.3**: インストルメンテーション追跡と自動クリーンアップ。新しい MCP ツール: `instrument`、`list_instruments`、`cleanup_instruments`。マーカー規約 `DH:<sessionId>` によるゼロ依存デバッグコード注入とデュアルモードクリーンアップ（instrument 記録による明示的モード、workspace grep によるフォールバック）。`dryRun` プレビュー対応。ワークスペースメモリ経由のクロスモデルデバッグプロトコル。アップストリーム debug スキルを debug-hub スキルに置き換え。詳細は [debug-hub](debug-hub.md)。

- `1.10.0` (2026-05-09):
  - **debug-hub v0.2**: 自動 Trace 物化（デバウンス）、agent デバッグセッション、構造化証拠イベント、`/api/health`、`timeline` / `health` / `compact_context` MCP ツールを追加。HTTP エンドポイント入力バリデーション、MCP 引数バリデーション、パストラバーサル保護、大文字小文字を区別しない検索、デバウンスドトレースインデックスを含む。詳細は [debug-hub](debug-hub.md)。

- `1.8.0` (2026-05-08):
  - ラップされた `codex`、`claude`、`gemini`、`opencode` セッション向けの self-trigger harness routing を追加。
  - **Model Router**: Agent Team 向けのインテリジェントなマルチモデルディスパッチ。モデル能力レジストリ (8モデル)、タスクタイプからモデルへのルーティング、3つの CLI プロトコルアダプタ (claude/codex/gemini)、コスト昇順のフォールバックチェーン、Agent 呼び出し可能な `model-router` スキル、`AIOS_MODEL_{ROLE}` 環境変数オーバーライド、知覚フィードバックループ統合を含みます。詳細は [モデルルーター](model-router.md) を参照してください。
  - **GroupChat Runtime**: `aios team` の live モードが共有会話履歴を持つラウンドベースのエージェント実行に対応。各ラウンドのエージェントは並列実行され、全エージェントが蓄積されたスレッド全体を参照可能。ブロックされたエージェントは自動的に re-plan ラウンドをトリガー。従来の one-shot 独立 dispatch モデルとの差別化。
  - **OpenCode CLI subagent 対応**: `opencode-cli` がすべての orchestration パス（subagent、team、GroupChat runtime）で完全サポートされる `AIOS_SUBAGENT_CLIENT` に。

## 以前の安定版

- `1.7.1` (2026-04-26):
  - Solo Harness のリリース記事を追加。
  - 既存の persona/user profile memory layer（`aios memo persona ...`、`aios memo user ...`）を明確化し、以前のドキュメント漏れを修正。

- `1.7.0` (2026-04-26):
  - 単一 agent の夜間実行向けに `aios harness` を追加。run journal、stop/resume 制御、HUD 表示、必要に応じた worktree 分離を提供。
  - 公式 `Solo Harness` ドキュメントを English、中国語、日本語、한국어 へ同期。

## さらに以前の安定版

- `1.6.3` (2026-04-25):
  - 中国語版の視覚的オンボーディング構成を English、日本語、한국어 ページへ同期。
  - Overview、Quick Start、シナリオ別コマンド、Agent Team を同じ初心者優先ルートへ更新。

- `1.6.2` (2026-04-25):
  - 公式ドキュメントに初心者ルート、TUI Setup/Doctor、ContextDB 記憶ループ、Agent Team/HUD の視覚ガイドを追加。
  - 新規ユーザーが高度な ContextDB、Agent Team、orchestration 概念より先に、作業別コマンドを選べる構成へ改善。

- `1.6.1` (2026-04-25):
  - clean Linux checkout で GitHub Release pipeline が通るよう修復。
  - 中国語オンボーディング文書を簡略化し、新規ユーザーが作業別にコマンドを探せるよう改善。

## 最近のバージョン

- `main` (未リリース):
  - **debug-hub MCP ネイティブデバッグログサービス** (2026-05-06): coding agent 向けの MCP ネイティブなデバッグログ収集。Node.js/Browser/Go SDK、組み込み Web UI、`~/.debug-hub/` 配下のファイルベースストレージ、agent 自己診断用の 5 つの MCP ツール（`list_traces`、`get_trace`、`search_logs`、`get_stats`、`clear_logs`）を提供。agent は人間の介入なしに自身のランタイムログを内省可能
	  - **Agent self-trigger harness routing** (2026-05-05): ラップされた `codex` / `claude` / `gemini` / `opencode` セッションが `single/subagent/team/harness` を提示；長時間・夜間・再開可能な目標は `aios harness run ... --workspace <project-root>` を自己トリガーでき、`--max-iterations` と `CTXDB_HARNESS_PROVIDER` / `CTXDB_HARNESS_MAX_ITERATIONS` で制御可能
  - **ラップされた coding agent 向け Privacy Shield** (2026-04-24): ContextDB shell の対話型 CLI 起動時に Privacy Guard 状態、カスタムモデル中継エンドポイント検出、`aios privacy read --file <path>` の安全な読み取りパスを示すカラーのプライバシーパネルを表示；自動プロンプトでも LLM のプライバシー指示は助言的で、検証可能な保護は deterministic な AIOS gate によるものだと明示
  - **ワークスペース認識の routed startup + プロジェクト Node 選択** (2026-04-23): routed `ctx-agent` startup が non-AIOS リポジトリから起動された場合でもアクティブな git ワークスペースを保持；`mcp-server` の npm scripts は `scripts/with-project-node.mjs` 経由で実行され、`.nvmrc` / Node 24 を一貫して尊重するため、組み込み `node:sqlite` により外部 SQLite addon の ABI ドリフトを避け、Node 24 が見つからない場合は明確なエラーを返します
  - **ContextDB Shell 起動最適化** (2026-04-22): `ctx()` が `npm run -s contextdb` よりコンパイル済み `mcp-server/dist/contextdb/cli.js` を優先し、1 回あたりのオーバーヘッドを ~0.3s から ~0.06s に削減；one-shot エージェント起動を ~2.2s から ~0.5s に短縮（約 78% 高速化）；shell-bridge の `detectRunner` が `tsx` を不要に；インストール時に `dist/` がない場合は自動ビルドし、ビルド失敗時は npm-run モードに自動フォールバック
  - **デフォルト core skills 更新** (2026-04-19): `awesome-design-md`、`frontend-design`、`cap-commit-push` をデフォルト core skills に昇格
  - **ContextDB レイジーロード** (2026-04-18 〜 2026-04-19): インタラクティブセッションがデフォルトでレイジーコンテキストロード (`CTXDB_LAZY_LOAD=on`) を使用；エージェントはフルコンテキストパックの注入ではなくファサードプロンプトでメモリを自己発見；[レイジーロードドキュメント](contextdb.md#lazy-load) と多言語ブログ記事を追加
  - **AIOS ワークフロールーター skill** (2026-04-18): タスクから skill への信頼性あるルーティングと発見のため `.claude/skills/aios-workflow-router` を追加
  - **Browser MCP の browser-use CDP への移行** (2026-04-10): デフォルトのブラウザランタイムを Playwright から browser-use MCP over CDP に切り替え；新しいランチャー `scripts/run-browser-use-mcp.sh`；移行コマンド `aios internal browser mcp-migrate`；スクリーンショットタイムアウトガード `BROWSER_USE_SCREENSHOT_TIMEOUT_MS` 設定可能
  - **HUD/Team skill-candidate 機能強化** (2026-04-09 〜 2026-04-10): 詳細ビュー用の `--show-skill-candidates` フラグ；設定可能な `--skill-candidate-limit <N>`；fast-watch モードのデフォルト制限を 6 から 3 に削減；パフォーマンス向上のための artifact 読み取りキャッシュ；HUD が `skill-candidate apply` コマンドを提案；team status で skill-candidate artifacts と drafts を表示
  - **Quality-gate の可視化** (2026-04-08 〜 2026-04-09): HUD minimal status と team history summary に quality-gate category を表示；quality-failed-only フィルター；multi-value 対応の quality prefix フィルター
  - **Learn-eval draft 推奨** (2026-04-07 〜 2026-04-09): hindsight lesson drafts；skill patch draft candidates；draft recommendation apply フロー；skill-candidate draft artifacts の永続化
  - **Turn-envelope v0** (2026-04-07): ターンベースのテレメトリイベントリンク；harness の clarity entropy memo カバレッジ
  - **Browser doctor 自動修復** (2026-04-06 〜 2026-04-08): `doctor --fix` で CDP サービスを自動修復；setup/update ライフサイクルで browser doctor を自動修復；ドキュメントに CDP クイックコマンドを追加
  - **マルチ環境 RL トレーニングシステム**: shell、browser、orchestrator アダプタを持つ共有 `rl-core` 制御プレーン；3 ポインター checkpoint 系列；4 レーン replay pool；PPO + teacher 蒸留トレーニング
  - **混合環境キャンペーン** (`rl-mixed-v1`): 1 つのライブバッチが shell + browser + orchestrator episode にまたがり、統一ロールバック判断で実行
  - ContextDB `search` がデフォルトで SQLite FTS5 + `bm25(...)` ランキングになり、FTS 利用不可時は自動レキシカルフォールバック
  - ContextDB セマンティックリランキングがクエリスクープのレキシカル候補で動作し、古い完全一致のドロップを削減
  - `aios orchestrate` の `subagent-runtime` live 実行（`AIOS_EXECUTE_LIVE=1` で opt-in）
  - 所有権ヒント付きバウンド work-item キュー Scheduling
  - no-op ファストパス：上流 handoff がファイルをタッチしなかった場合に `reviewer` / `security-reviewer` を自動完了
  - `main` への各 push 時に Windows PowerShell shell-smoke ワークフロー（`.github/workflows/windows-shell-smoke.yml`）
  - `global` / `project` ターゲット選択を持つスコープ対応 `skills` インストールフロー
  - canonical skill オーサリングが `skill-sources/` に移動、repo-local クライアントルートは `node scripts/sync-skills.mjs` で生成
  - デフォルト skills インストールモードがポータブル `copy` に；明示的 `--install-mode link` はローカル開発向けに維持
  - リリース packaging/preflight が `check-skills-sync` で生成 skill roots を検証
  - コアデフォルト、オプショナル business skills、アンインストールでインストール済み項目のみ表示のカタログ駆動 skill ピッカー
  - TUI skill ピッカーが `Core` と `Optional` にグループ化し、ターミナル可読性のために説明を切り詰める
  - `doctor` が同名グローバルインストールのプロジェクト skill 上書きを警告
  - Node ランタイムガイダンスが Node 24 LTS に明示的に整合
  - **Ink TUI リファクタ** (v1.1.0): TypeScript + Ink ベースの React コンポーネント TUI；REXCLI ASCII アート起動バナー；アダプティブ watch 間隔；左右オプションサイクリング
- `0.17.0` (2026-03-17):
  - TUI アンインストールピッカーが小さいターミナルでスクロールし、`Select all` / `Clear all` / `Done` を下部に固定
  - アンインストールカーソル選択が描画グループリストと整合 유지
  - セットアップ/更新 skill ピッカーがすでにインストール済みスキルを `(installed)` でラベル付け
- `0.16.0` (2026-03-10): orchestrator agent catalog と生成器を追加
- `0.15.0` (2026-03-10): `orchestrate live` をデフォルトで gate（`AIOS_EXECUTE_LIVE`）
- `0.14.0` (2026-03-10): `subagent-runtime` ランタイムアダプタ（stub）を追加
- `0.13.0` (2026-03-10): ランタイム manifest を外部化
- `0.11.0` (2026-03-10): ローカル orchestrate preflight の対応範囲を拡張
- `0.10.4` (2026-03-08): 非 git ワークスペースの wrapper fallback と docs 同期
- `0.10.3` (2026-03-08): Windows の cmd-backed CLI 起動を修正
- `0.10.0` (2026-03-08): セットアップ/更新/削除のライフサイクルを Node に統合
- `0.8.0` (2026-03-05): 厳格な Privacy Guard（Ollama 対応）とセットアップ統合を追加
- `0.5.0` (2026-03-03): ContextDB の SQLite sidecar index（`index:rebuild`）、任意の `--semantic` 検索、`ctx-agent` 実行コア統合

## 2026-03-16 運用状況

- 継続的ライブサンプルが成功中（`dispatchRun.ok=true`）、最新アーティファクト:
  - `.aios/context-db/sessions/codex-cli-20260303T080437-065e16c0/artifacts/dispatch-run-20260316T111419Z.json`
- `learn-eval` がまだ以下を推奨:
  - `[fix] runbook.failure-triage`（`clarity-needs-input=5`）
  - `[observe] sample.latency-watch`（`avgElapsedMs=160678`）
- latency-watch 観察が続く間、Timeout 予算は現状維持。

## 関連記事

- [ブログ：Skills インストール体験アップデート](/blog/ja/2026-03-rexcli-skills-install-experience/)
- [クイックスタート](getting-started.md)
- [ContextDB](contextdb.md)
- [トラブルシューティング](troubleshooting.md)

## 更新ルール

セットアップ、実行挙動、互換性に関わる変更は、同一 PR でドキュメントを更新し本ページにも反映します。

---
title: ブログハブ
description: "AIOS の技術・成長ブログ（日本語版）です。記憶システム、単一 agent の harness、Agent Team による並列協調、ブラウザ自動化、ワークフロー方針、複数クライアント運用の実践を扱い、各記事に再現できるコマンドと検証証拠を添えています。"
---

# ブログ

AI coding agent をより賢く、より可靠に、より使いやすくするためのストーリー、チュートリアル、深い考察。

AIOS はローカル agent ワークフローレイヤーです。新しい coding agent ではなく、既存の `codex`、`claude`、`gemini`、`opencode` に記憶、チームワーク、自己診断を追加するレイヤーです。

## ここから始める

AIOS を初めて使う方へ。これらの投稿で概要を把握できます:

- [AIOS で Google Harness² を再現した——harness エンジニアリングの価値は何点か](2026-10-harness2-jobbench-aios-measurement.md) — AIOS 席を同一得点台で実測：裸 51.1 → AIOS 85.8（+34.7pp）、論文値も自trackの再帰法も上回る
- [AIOS のストーリー](launch-post.md) — なぜ作られたか、どんな問題を解決するか
- [CLI 比較：生 vs. AIOS](cli-comparison-post.md) — レイヤーを追加すると何が変わるか
- [自動化プレイブック](automation-playbook-post.md) — 日次使用的パタン
- [v4.0 適応型ワークフローポリシー](2026-07-v400-adaptive-workflow-policy.md) — ルートと計画の選び方
- [AI エージェントのワークフローはどう選ぶ？](2026-07-choose-agent-workflow.md) — 判断表と具体例
- [素の CLI から信頼できるワークフローへ](2026-07-raw-cli-to-reliable-workflow.md) — 再現可能な境界の作り方

## 最新の記事

- [v8.2.0：AIOS プラグインを GitHub から 1 コマンドでインストール可能に](2026-11-plugin-ecosystem.md) — コミュニティプラグインを現在のプロジェクトに導入し、解決した commit に固定。リポジトリのビルドスクリプトをスキップし、PR で一覧に追加

- [v6.7.0：一つのコマンドで全クライアントへ——「aios skill add」がコミュニティスキルの正門を開ける](2026-10-v670-external-skills-get-a-front-door.md) — 最良のコミュニティスキルが一つのクライアントのグローバルスキルディレクトリにしか存在せず、他の九つからは見えなかった。`aios skill add <source>` がローカルディレクトリや git URL を canonical 外部レジストリにステージし、全クライアントのユーザーレベルスキルルートへ配布——冪等、fail-closed な選択、自己コピー・ガードが `clone-website` の原本を守った

- [v6.6.0: エージェントの作業スペースがプロジェクト一覧に漏れた](2026-10-v660-scratch-space-leaked-into-your-project-list.md) — `-p` なしの `mktemp -d` が `cwd` に書くため プロジェクト親にサンドボックス 41 個（9.9 GB）が生えた。`AGENTS.md` で規則を明文化し、`scripts/aios-tmp-gc.mjs` は客観的事実だけで回収、読めないものは残す

- [v6.5.0: OpenCode 2.x プラグイン契約と、AIOS の居場所を嘘つかなくなった設定](2026-10-v650-opencode2-contract-config-stops-lying.md) — OpenCode 2.x は `default` エクスポートしか読まないため AIOS プラグインは静黙停止していた。1.x/2.x デュアルエクスポート化とインストール時自己修復、`aios interception mcp-repair` で失効 MCP パスを安定ランタイムルートへ戻す

- [一文の要件で、一つのソフトウェアを：小規模モデルが月36億トークン——AIOS が「誰でも開発できる」を現実のものにする](2026-10-qwen-flash-aios-pi.md) — 必要なスキルはただ一つ、要件を明確に語り切ること。キャッシュヒット96%で1か月高強度使用、むき出しモデル vs AIOS 包む前後比較、要件から納品までの流れが生んだ E:/coding のプロジェクト一覧
- [v6.4.0：推測しないコントロールプレーン——台帳は分岐しない、拒否は機能、ゲートは宣言どおりの場所で走る](2026-10-v640-control-plane-stops-guessing.md) — 計画台帳は分岐しない（A21–A23）、plan CLI は読み取り専用ビューへの置換ではなく拒否する（A19）、宣言されたチェックは CI で走る（A20 + ディレクトリ予算 + 影響テスト）、mattpocock v1.3 トリオを両面で採用

- [v6.3.0：/grill が本物のコマンドに、インタビューは自分で記録し、pi は自前で MCP キャリアを選ぶ](2026-10-grill-with-docs.md) — ヒアリングコマンドがついに 7 クライアントに登録され、確定した用語は CONTEXT.md へ、決定は ADR へ。pi 0.99+ はバージョンで MCP キャリアを選び、起動警告を重ねない

- [v6.0.1：エンジニアリング基準を rex-harness へ——基準の居場所を消費者と同じに](2026-09-v601-engineering-standards-rex.md) — 品質基準がそれを消費する能力チェーンと一緒に出荷される
- [v6.0.0：エンジニアリング基準の内蔵——AIOS はコードを生成するだけでなく、ソフトウェアを構築する](2026-09-v600-engineering-standards.md) — 古典的な書単から導出した一つの品質基準を router がコード生産 Provider の前に読み込み、すべての変更に Definition of Done
- [v5.20.0：Qoder が AIOS に合流——10 番目のクライアント、定義ブロック 1 つ](2026-09-v520-qoder-client.md) — 10 番目の第一級クライアント、Qoder が実際に読む settings.json への MCP、AGENTS.md コンテキスト、`-p` ヘッドレス team
- [Jev + AIOS クイックスタート：キーワード不要、裏側で自動判断](2026-09-jev-aios-quickstart.md) — TYPESAFE_API_KEY を設定し判断ゲートを開けたら、普段どおり話すだけで Jev が裏側で判断する
- [v6.2.0：実際にトリガーされるエンジニアリング標準](2026-09-engineering-standards-trigger-chain.md) — どのクライアントのディスクにもあったが誰も読むよう指示されなかった標準スキル、共有参照プロジェクション経路、そして完成を判定するファイル粒度ベースライン
- [v5.19.2：Windows が扱える名前](2026-09-v5192-names-windows-can-hold.md) — 候補 id をファイル名にすると NTFS では代替データストリームになり、昇格は静かに失われ、取り込み側はエラー 0 件と報告する
- [v5.19.1：本当に手の届く宣言チャネル](2026-09-v5191-declaration-you-can-reach.md) — shell から宣言できるようになり、そのために書いたガードが 82 個の未実行テストファイルを発見
- [v5.19.0：判断ゲートに身体を与える](2026-09-v519-judgment-gate-surfaces.md) — 無効時には存在しない aios_judge ツールと、保留しかできない rex ステージゲート
- [v5.18.0：AIOS に TypeSafe Jev を——デフォルトはオフ、それは意図的](2026-09-v518-judgment-gate.md) — 認証情報の設定、ドキュメント MCP が判断できない理由、fail closed な opt-in ゲート
- [v5.16.0：ZCode が AIOS に合流——本物のサブエージェント付き](2026-09-v516-zcode-client.md) — 第一級クライアント、agents plugin ブリッジ、strict-schema MCP、Pi 能力チェーン修復
- [v5.15.0: Pi が本物の MCP 能力を獲得](2026-09-v515-pi-mcp-bridge.md) — codemap 検索、MCP ブリッジ、doctor 整理の対
- [v5.14.0: LoopX コントロールプレーン + 孤児プロセス根絶](2026-09-v514-loopx-control-plane.md) — 精算ターン、無人リズム、孤児ゼロ
- [Pi coding agent が AIOS ファーストクラスクライアントに](2026-09-pi-client-aios.md) — skills、extension、RPC
- [v5.8.1: エージェントがフリーズしない — aios-shell 停止修正と LLM の意味判断による要件明確化](2026-08-v581-stall-fix-llm-judged-grilling.md)
- [v5.8.0: AIOS が安全に自己進化する — Session Memory、証拠ゲート、ロールバック可能な昇格](2026-08-v580-governed-self-evolution.md)
- [v5.6.1: プラン駆動のマルチエージェントディスパッチ — aios work がプランを読む](2026-08-v561-aios-work-plan-driven-dispatch.md)
- [v5.6.0: 並列マルチエージェントコーディングを1コマンドで — aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Graph Engine とローカルエージェント：AIOS が Loop Engineering を Graph Engineering へ接続する仕組み](2026-08-10-aios-loop-graph-engineering.md)
- [v5.5.1：証拠駆動の Agent ライフサイクル昇格](2026-08-v551-agent-lifecycle-promotion.md)
- [v5.5.0: Ask-First 要件アライメント——エージェントが不要なものを届けなくなる](2026-08-v550-ask-first-requirements-alignment.md)
- [v5.4.4：エージェントスモークテストの信頼性——出力コントラクトクライアントとタイムアウト自動エスカレーション](2026-08-v544-agent-smoke-reliability.md)
- [v5.4.3：CRG 決定チェックポイント、Worker Journal リネーム、冪等な aios init](2026-08-v543-crg-decision-checkpoints.md)
- [v5.4.1：Windows で「aios update」が壊れていた理由と、自己更新の修正](2026-08-v541-windows-self-update-safety.md)
- [並列コーディングエージェントは無料ではない: Git Worktree はファイルを隔離し、状態は隔離しない](2026-08-parallel-coding-agents.md)
- [Agent セキュリティは状態機械の問題: Codex セキュリティスレッドが見逃したもの](2026-08-ai-agent-security.md)
- [AI コーディングコストは制御不能: Cursor は数字を隠し、Amazon は 180 万ドルを溶かし、ローカルレイヤーが変えるもの](2026-08-ai-coding-cost-crisis.md)
- [v5.4.0：ワークフローイテレーション v2.1 — Activation の安全性、型付き Evidence 契約、全 Skill 監査](2026-08-v540-workflow-iteration-v21.md)
- [v4.0 適応型ワークフローポリシー](2026-07-v400-adaptive-workflow-policy.md)
- [AI エージェントのワークフローはどう選ぶ？](2026-07-choose-agent-workflow.md)
- [素の CLI コマンドから信頼できる AI エージェントワークフローへ](2026-07-raw-cli-to-reliable-workflow.md)
- [v3.6.0：Headroom と Ponytail でより安全な Token インテリジェンス workflow を作る](2026-07-headroom-token-intelligence.md)
- [v3.2.0：Harness 信頼性とスキルライフサイクル向上](2026-07-v320-harness-reliability-upgrade.md)
- [Grok Build が AIOS のファーストクラスクライアントに](2026-07-grok-build-aios-client.md)
- [Hermes Agent が AIOS ファーストクラスクライアントに昇格](2026-06-hermes-agent-aios-client.md)
- [v2.0.2: より安全な Skill Health Records とよりクリーンな Crush Config](2026-06-v202-ecc-uplift.md)
- [Agent Governance: Team live 実行の前に証跡を残す](2026-06-agent-governance.md)
- [v1.52.0: 決定論的 Shell 出力圧縮 (MCP 経由)](2026-06-v152-aios-shell-mcp.md)
- [v1.50.1: All-Client Token Compression Compliance](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0：記憶、ドキュメント、計画、コードを横断する統合 AIOS 検索](2026-06-v150-unified-aios-search.md)
- [Codemap：AIエージェントにコードベースの地図を](2026-05-codemap-crg.md)
- [ContextDB Token 圧縮：より小さな context pack と安全な recall](2026-05-token-compression.md)
- [Model Router：すべてのタスクに適切なモデル](2026-05-model-router.md)
- [aios memo GUI：Agent の記憶を生きたグラフとして可視化](2026-05-aios-memo-gui.md)
- [Solo Harness: 1つの Agent を夜通し動かしても制御を失わない](2026-04-solo-harness.md)
- [debug-hub: Agent が自らデバッグする時代](2026-05-debug-hub-mcp.md)
- [Browser MCP 改善：より賢いページ読み取り](2026-04-browser-mcp-weak-model-upgrade.md)
- [高度なデザインスキルでページ制作：曖昧プロンプトを本番 UI に](advanced-design-skills-page-building.md)
- [AIOS TUI リファクタリング：React Ink によるモダンなターミナルUI](2026-04-rexcli-ink-tui-refactor.md)
- [Windows CLI 起動安定性アップデート](windows-cli-startup-stability.md)

## 深い考察

- [AIOS RL Training System: Agent に学習させる](rl-training-system.md)
- [ContextDB 検索：履歴の中からを見つける](contextdb-fts-bm25-search.md)
- [Orchestrate Live：本番で Subagent を実行する](orchestrate-live.md)

## FAQ

### どこから始めたらいいですか？
まず [AIOS のストーリー](launch-post.md) を読み、次に [クイックスタート](https://cli.rexai.top/ja/getting-started/) ガイドを試してください。

### 記憶とコンテキスト管理を大事にしたい
[Token 圧縮](2026-05-token-compression.md) から始めて、[ContextDB 検索](contextdb-fts-bm25-search.md) を読んでください。

### agent を夜通し走らせたい
[Solo Harness](2026-04-solo-harness.md) を読んでから、[Solo Harness ドキュメント](https://cli.rexai.top/ja/solo-harness/) を確認してください。

### agent に自らデバッグさせたい
[debug-hub](2026-05-debug-hub-mcp.md) を読んでから、[debug-hub ドキュメント](https://cli.rexai.top/ja/debug-hub/) を確認してください。

### AIOS は新しい coding agent ですか？
いいえ。`codex`、`claude`、`gemini`、`opencode` をラップして記憶、チームワーク、自己診断を追加します。ワークフローは変わりません。

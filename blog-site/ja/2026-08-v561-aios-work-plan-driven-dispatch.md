---
title: "v5.6.1: プラン駆動のマルチエージェントディスパッチ — aios work がプランを読む"
description: "v5.6.1 で aios work はプラン駆動に。アクティブな構造化プランの対象タスクが、依存関係・所有パス・受入条件付きの並行ワークアイテムになります。"
date: 2026-08-12
tags: ["AIOS", "multi-agent", "parallel", "dispatch", "planning", "release", "v5.6.1"]
---

# v5.6.1: プラン駆動のマルチエージェントディスパッチ — `aios work` がプランを読む

## Problem

[v5.6.0](2026-08-v560-aios-work-concurrent-dispatch.md) で `aios work` は、並行マルチエージェントコーディングのワンコマンド入口になりました。plan、decompose、そして planner・implementer・reviewer・security-reviewer のジョブを merge gate で束ねてディスパッチします。ただし分解ステップはまだ暗黙的で、ワークアイテムはタスクタイトルと `--context` ヒントから推測されていました。依存関係・所有パス・受入条件を持つ構造化プランがドキュメントにあっても、ディスパッチはそれを読まず、ディスパッチ後のレポートが実際に実行されたワークアイテムと食い違うこともありました。

## Quick Answer

**v5.6.1 で `aios work` はプラン駆動になります。構造化プランがアクティブなとき、対象プランタスクがそのまま並行ワークアイテムになります。** 各ワークアイテムはプランの依存関係、所有パス（`targets` + `allowedWrites`）、受入条件を保持するため、並行サブエージェントはプランが描いた境界どおりに作業します。`;` 区切りの `--context` フォールバックはプランなしの実行用に残り、新しい `aios-work-dispatch` スキルは、いつ並行ディスパッチが正解か（プラン型作業、独立アイテム 2 つ以上、ファイル所有の重複なし、厳密な順序なし）と、プレビュー／承認境界をエージェントに教えます。

## v5.6.1 で変わったこと

1. **プランタスクがワークアイテムに。** `aios work` がアクティブな構造化プランを分解し、対象プランタスクを依存関係・所有パス（`targets` + `allowedWrites`）・受入条件ごとワークアイテムに昇格させます。
2. **セミコロン context はフォールバックのまま。** アクティブプランがなければ `--context "mcp-server 重构; docs 更新; テスト補充"` でこれまでどおり分解されます。プランなしの呼び出しは変わりません。
3. **レポートが実行されたプランと一致。** ディスパッチ後レポートはプラン駆動の分解を保持し、ワークアイテムを再計算しないため、見える `workItems` は実際に実行されたものです。
4. **エージェントがディスパッチのタイミングを学習。** 新しい正規 `aios-work-dispatch` スキルが、参入条件（planned disposition、独立アイテム 2 つ以上、ファイル所有の重複なし、厳密な順序なし）、分解の表現方法、プレビュー／承認境界を固定化します。
5. **ルーターが並行作業をディスパッチへ。** `aios-workflow-router` は並行可能なプラン型作業をディスパッチスキルへルーティングし、プランから並行実行までのループが推測ではなく教えられた挙動になります。

## プラン駆動の分解の仕組み

- **真実の源泉はプラン。** 対象プランタスクは依存関係・所有パス・受入条件を自ら持っているため、`aios work` は自由テキストから再推測せず読み取ります。
- **所有は明示的。** 各ワークアイテムの `targets` + `allowedWrites` が並行サブエージェントを自分のレーン内に保ち、merge gate はファイル所有の重複を引き続きブロックします。
- **フォールバックは予測可能。** アクティブプランがなければ、タスクタイトルと `;` 区切り `--context` による分解が v5.6.0 とまったく同じように動きます。
- **安全性は不変。** preflight readiness、capability guard、owned-path file policy、merge gate はすべて引き続き有効。`--dry-run` は分解結果のプランとワークアイテムをゼロコストでプレビューします。

## Examples

```bash
# プラン駆動：ワークアイテムはアクティブな構造化プランから
aios work --task "Ship the release checklist"

# 実行前にプラン駆動の分解をプレビュー
aios work --task "Ship the release checklist" --dry-run --json

# プランなしフォールバックはそのまま動く
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# 結合されたプランタスクは強制シリアル
aios work --task "Refactor the auth module" --serial
```

## FAQ

### ディスパッチがプランを読むことを確認するには？

`aios work --task "..." --dry-run --json` は、実行前に分解されたワークアイテム・依存関係・所有パスを表示します。アクティブプランがあれば、ワークアイテムはプラン由来です。

### これでプランニングプロセスは置き換わりますか？

いいえ。プランが唯一の真実の源泉のままで、ディスパッチはそれを尊重するだけです。構造化プランを使うワークフローでは、`aios work` は新たに境界を発明せず、プランの境界を実行します。

### 並行化すべきでないのはいつ？

並行ディスパッチには、独立アイテム 2 つ以上、ファイル所有の重複なし、アイテム間の厳密な順序なしが必要です。結合変更は単一レーン（`--serial`）に属します。新しい `aios-work-dispatch` スキルはこれらのゲートを固定化しているため、エージェントは推測しません。

### 承認境界は引き続き人間制御ですか？

はい。ディスパッチスキルは live 実行の前にプレビューを要求し、`--dry-run` でプラン駆動のワークアイテムをゼロコストでレビューできます。live ディスパッチは v5.6.0 の readiness・capability・ownership・merge-gate ガードを維持します。

### アップグレード後やリポジトリ移動後に MCP サーバーが壊れました

クライアント設定（例：`~/.config/opencode/opencode.json`）の MCP エントリは、このリポジトリの `scripts/` ランチャーへの絶対パスを保存しています。プロジェクトやインストールディレクトリが移動するとパスが存在しなくなり、サーバーが起動できません。新しいプロジェクトルートで修正します：

```bash
aios internal browser mcp-migrate
# または：aios update   （browser コンポーネントはデフォルト更新セットに含まれる）
```

その後クライアントを再起動してください。`aios doctor` はランチャーパスの確認のみで、書き換えは行いません。詳細：[トラブルシューティング](https://cli.rexai.top/ja/troubleshooting/)。

## Related

- [v5.6.0: 並行マルチエージェントコーディングを 1 コマンドに — aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Orchestrate Live: 本番で Subagent を動かす](orchestrate-live.md)
- [並行コーディングエージェントはただではない：Git Worktree はファイルを隔離し、状態は隔離しない](2026-08-parallel-coding-agents.md)
- [Agent ガバナンス：Team 実行は Live 前に実力を証明する](2026-06-agent-governance.md)
- Docs: [Team Ops](https://cli.rexai.top/ja/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/ja/route-concurrency-profiles/)

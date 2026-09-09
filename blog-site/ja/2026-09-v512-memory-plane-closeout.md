---
title: v5.12.0 メモリシステム仕上げ——保存から運用へ：ハイジーン、レポート、移行インポート、ティア付きロード
date: 2026-09-09
description: "memoハイジーン（削除ゼロ）、aios memory reportでメモリ全体を一括可視化、aios importで旧メモリを統治対象候補へ移行、AgentView T0-T3ティア、Autodreamはopt-in起動、embeddingラフランクは既定オフ。実コーパス基準 top-1 98%。"
---

# v5.12.0 メモリシステム仕上げ——保存から運用へ：ハイジーン、レポート、移行インポート、ティア付きロード

> 2026-09-09 · メモリ backlog 13 件を全てクローズ（10 件実装 + 3 件検証、うち 2 件はとっくに出荷済みで状態記録が未更新だっただけ）。回帰 1106 テスト / 0 失敗。

## クイックアンサー

v5.11.0 が「書き込みの gate」を作ったなら、今回のは「保存後の運用」：pinned の上限超過を警告し整理入口を提供（アーカイブのみ、削除は絶対にしない）、1 コマンドでメモリ全体を可視化、旧メモリを統治キューへ移行、サブエージェントのコンテキストを 4 ティア + 予算計算で、Autodream に opt-in 自動起動。破壊的変更なし、pull するだけですぐ使える。

```bash
aios memo hygiene          # 読み取り専用チェック + 整理提案
aios memory report         # space別ボリューム/無効化率/候補滞留/採用率
aios import --format claude --file ~/MEMORY.md --dry-run
```

## 主な変更

- **memo hygiene（E2+E3）**：survey は sessions/pinned/イベントサイズを一覧；`--archive-stale-sessions` は移動アーカイブ（衝突時は拒否）、`--rotate-events` は keep-newest ローテーション（moved+kept 突合 + sha256）；削除は一切なし、space レベルの稼働 session はアーカイブ対象外。
- **memory report（G2）**：space別ボリューム/無効化率/候補 4 状態/feedback採用率/pinned 予算。`--json` 対応、doctor と職務分離。
- **aios import（F3）**：Claude/Continue/Roo/CONVENTIONS の 4 形式 → 統治対象 candidate（公開権限のない identity で書き込み、B1 は迂回不可）、冪等 + `#import-<format>` タグ、ガイドは `docs/import-migration.md`。
- **段階的開示 + pinned 予算（C3+C4）**：`search --level summary` は 1 行約 100 トークン + `pack:` フッター；`pin status` は使用率トリプルを表示、超過時は truncated。
- **AgentView ティア（H1）**：T0-T3 の 4 ティア + 各ティアの文字予算計算；`ctx-agent.mjs workspace-view` は pull 型読み取り、既定 T3 で既存呼び出し側は無影響。
- **Autodream Phase B（E1）**：`AIOS_AUTODREAM_AUTO=1` で close+アイドルの dual トリガ、preview のみで統制付き apply へ；dream はゼロ LLM なので最安ルートは自明。
- **embedding ラフランク + 実コーパス基準（A4+G1）**：`AIOS_MEMO_EMBEDDER=hash-lexical` は既定オフ、union-only で追加のみ（AB 第 5 アームはゼロドリフト）；実コーパス基準 top-1 98% / top-5 100%。
- **検証でクローズ（C1/C2/F2）**：予算デグレード投影と orchestrate 呼び出しチェーンは実装済み；refs/canvas は以前から出荷済み；generatedTargets は能力由来でハードコードではない、差分は workbuddy の 1 件のみに縮小。F1 は楽観ロック衝突時の自動マーカー痕跡を追加。

## アップグレード

破壊的変更なし。回帰 1106 テスト / 0 失敗（101 ファイル、新規 9 スイートを含む）、AB 5 アームはゼロドリフト。

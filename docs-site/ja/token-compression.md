---
title: ネイティブ Token 圧縮
description: RTK、Caveman、競合 shell hook をインストールせずに使う Harness CLI の入力/出力 token 削減ワークフロー。
---

# ネイティブ Token 圧縮

## クイックアンサー

Harness CLI は token をネイティブに削減します。RTK 風の入力フィルタリングと Caveman 風の短い出力を参考にしますが、RTK、Caveman、shell hook、競合 CLI は**インストールしません**。

ワークフローは 2 層です。

1. **入力圧縮**：ContextDB packet、ブラウザ読み取り、コマンド出力をモデル投入前に削減する。
2. **出力圧縮**：コマンド、パス、エラー、selector、日付、リスク、検証ギャップを残したまま Agent の回答を短くする。

## 入力圧縮

### ContextDB Packet

組み込みの `context:pack` strategy engine を使います。

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out .aios/context-db/exports/<session_id>-context.md
```

Strategies:

| Strategy | 用途 | 振る舞い |
|----------|------|----------|
| `legacy` | 厳密な後方互換 | tail-window behavior |
| `balanced` | 推奨デフォルト | 低シグナル本文を圧縮してから drop |
| `aggressive` | 厳しい token budget、明示 opt-in | より強い圧縮と clipping |

安全ルール：

- 重要エラー、失敗語、ファイルパス、コマンドシグナル、最新状態を保持する。
- イベントを落とす前に、重複行、stack trace、低シグナル行集合を圧縮する。
- 保護イベントを切る前に、低優先度イベントを落とす。
- telemetry: `strategy`、`rawTokenUsed`、`compressed`、`dropped`、`truncated` を出力する。

### ブラウザ読み取り

`aios-browser-compress` でコンパクトな証拠を優先します。

1. `page.semantic_snapshot`
2. targeted `page.extract_text`
3. full `page.extract_text`
4. `page.get_html`
5. 視覚証拠が必要な時だけ screenshot

click、type、publish、delete の前に、圧縮ビューで対象が証明できない場合は狭く再読み取りします。

### CLI 出力

shell hook はインストールしません。ツールに範囲を絞った出力を求めます。

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

## 出力圧縮

`aios-compress` で回答スタイルを制御します。

| Level | 用途 | 振る舞い |
|-------|------|----------|
| `tight` | 通常の開発 | 簡潔な技術回答、無駄なし |
| `ultra` | harness logs、checkpoints | 1 行の証拠 + 次の action |
| `precise` | browser actions、安全、不可逆操作 | 完全で明示的な表現 |

Controls:

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

## なぜネイティブか

ネイティブ圧縮は Codex と Claude で監査しやすく、一貫性を保てます。

- 競合依存なし。
- グローバルなコマンド書き換えなし。
- 隠れた shell 挙動なし。
- docs、skills、code がこの repo にある。
- 検証で何を圧縮/削除したか確認できる。

## 関連ファイル

- `mcp-server/src/contextdb/core.ts`
- `skill-sources/aios-compress/SKILL.md`
- `skill-sources/aios-browser-compress/SKILL.md`
- `.codex/skills/aios-compress/SKILL.md`
- `.codex/skills/aios-browser-compress/SKILL.md`
- `.claude/skills/aios-compress/SKILL.md`
- `.claude/skills/aios-browser-compress/SKILL.md`

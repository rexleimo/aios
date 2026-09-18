---
title: "Browser MCP 弱モデル改善: Semantic Snapshot + Text Click"
description: "今回の反復では、コンパクトなページ理解プリミティブ、テキスト優先クリック、実 CDP 互換性の修正により、弱モデルのブラウザ実行成功率を改善しました。記事では変更前後の比較、依然として失敗する境界ケース、乗り換えを判断する材料を示します。導入前に確認すべき指標も整理しています。"
date: 2026-04-18
tags: [Browser MCP, 弱モデル, Agent Runtime, AIOS, Reliability]
---

# Browser MCP 弱モデル改善: Semantic Snapshot + Text Click

今回の反復の目的は明確です。**能力の低い計画/コーディングモデルでも、ブラウザタスクを安定して完了できるようにすること**。同時に、強いモデルの経路は劣化させません。

対象は、複雑ページ・厳格ロケータ・長い操作チェーンで失敗しやすい低能力プランナーモデル（例: 一部の GLM/minmax/Ollama 構成）です。

## 問題の要約

更新前、弱モデルの失敗点は主に3つでした。

- ページテキスト/HTML が高ノイズで、次アクションの選択が不安定
- 低レベルのロケータ生成と一意性解消が苦手
- 単体テストは通るが、実 CDP では `evaluate` 互換差で壊れる

## 今回のリリース内容

### 1) ネイティブプロンプトのブラウザ運用を強化

標準 SOP を以下へ強化しました。

- `read -> act -> verify` の短サイクル
- 盲目的な多段アクション連鎖を禁止
- 密度の高い/動的ページでは `semantic_snapshot` を先行
- ラベルが明確な場合は `click_text` を優先

### 2) 弱モデル向け MCP プリミティブを追加

browser-use ランタイムに高レベルツールを追加:

- `page.semantic_snapshot`
  - `title`/`url`/見出し/操作候補/切り詰め状態を返す
  - 生 HTML より低エントロピーで意思決定しやすい
- `page.click_text`
  - テキスト優先クリック（`exact` / `nth` / `timeout_ms`）
  - 脆い selector 手書きを大幅に削減

### 3) 実 CDP スモークに基づくランタイム堅牢化

初回の実ブラウザスモークで露出した差分を修正しました。

- locator evaluate 契約修正（`arguments[0]` -> 明示引数）
- semantic snapshot の文字列化オブジェクト互換
- `page.goto` URL 読み戻しフォールバック（`get_url` -> `location.href`）
- text click 候補の収束（インタラクティブ要素優先 + selector 重複排除）

## 検証

### 自動テスト

- `mcp-browser-use` の `pytest -q`: **15 passed**

### 実 CDP スモーク（修正後）

手順:

1. `browser.connect_cdp`
2. `page.goto("https://example.com")`
3. `page.wait(text="Example Domain")`
4. `page.semantic_snapshot(max_items=8)`
5. `page.click_text("Learn more")`
6. `browser.close`

結果: ライブ実行ですべて成功。

## 弱モデルに効く理由

本更新の本質は**意思決定の複雑度を下げること**です。

- 高ノイズ DOM ではなく、コンパクトな意味情報を渡す
- selector 合成ではなく、テキスト中心アクションを使う
- 読み戻しと曖昧性処理を強化し、失敗連鎖を抑制

強モデルは従来の能力を維持したまま利用できます。

## 次の反復

- `NOT_UNIQUE` の消歧ヒント強化
- モデル階層別プロンプトプリセット（weak/medium/strong）
- 弱モデル向けブラウザ回帰ベンチマーク整備


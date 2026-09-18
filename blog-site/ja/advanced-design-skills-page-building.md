---
title: "高度デザインスキルでページ制作: 曖昧プロンプトを本番 UI に変える"
publish_date: 2026-04-18
description: "DESIGN.md と frontend-design を組み合わせ、短い曖昧な依頼でも一貫した高品質 UI/UX を作る実践ガイドです。ビジュアル契約のテンプレート、受け入れチェックリスト、手戻りが起きる典型例を収録し、フロントエンドとデザインの協業場面に向いています。"
---

# 高度デザインスキルでページ制作: 曖昧プロンプトを本番 UI に変える

ユーザー依頼は短く曖昧になりがちです:

- 「このセクションをもっと良くして」
- 「Stripe風にして」
- 「SaaS管理画面を全部作って」

スタイル契約がないまま実装すると、汎用テンプレ風の出力になりやすいです。
解決策はシンプルで、先にスタイルを固定してから実装することです。

## 2つのスキルを組み合わせる

1. `awesome-design-md` - `DESIGN.md` で見た目の契約を作る
2. `frontend-design` - 契約に従って本番 UI を実装する

実装前に方向を決めることで、品質のぶれを抑えられます。

## クイックセットアップ

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
npx --yes getdesign@latest add linear --force
```

固定プロンプト:

```text
まず DESIGN.md でスタイルを固定し、その後 frontend-design でページを実装してください。
```

## 曖昧入力は3モードで処理

- `Patch`: 要素単位の小さな改善
- `Restyle`: 構造を維持して見た目を更新
- `Flow`: SaaS の画面遷移を含む一連のフロー

分類後、短い前提（目的、ユーザー、プラットフォーム、範囲）を書いて実装を進めます。

## SaaS 交付の最低基準

`Flow` では最低限:

- ダッシュボード
- 一覧
- 詳細
- 作成/編集フォーム
- 設定/請求相当
- 状態: `loading`, `empty`, `error`, `success`
- 交互作用状態: `hover`, `focus`, `active`, `disabled`

これが「見た目だけの断片 UI」を避ける基準です。

## スタイル初期選択

- SaaS/B2B: `linear`, `vercel`, `supabase`
- マーケティング: `framer`, `stripe`, `notion`
- ドキュメント: `mintlify`, `hashicorp`, `mongodb`

業種情報がなければ `linear` を使います。

## プロダクト組み込み時の推奨

次のシステムプロンプトを既定で入れると安定します:

```text
ユーザー要件が曖昧な場合は、まず Patch/Restyle/Flow に分類してください。DESIGN.md でスタイルを固定してから実装し、hover/focus/active/disabled と loading/empty/error/success を必ず含めてください。
```

プロンプト例を増やすより、このルールを固定する方が効果的です。

## 関連ドキュメント

- [高度デザインスキル（ドキュメント）](https://cli.rexai.top/ja/advanced-design-skills/)

---
title: 高度デザインスキル
description: DESIGN.md と frontend-design で、曖昧な依頼から本番品質のページを安定生成する。
---

# 高度デザインスキル: ページ制作ガイド

ユーザーは「この要素をいい感じに直して」「このサービス風にして」など、曖昧な依頼を出すことが多いです。
このページは、そうした入力でも一貫した UI/UX を出すための公式フローです。

## クイックアンサー

2つのスキルを組み合わせます:

- `awesome-design-md`: `DESIGN.md` でスタイル契約を先に固定
- `frontend-design`: 契約に従って実装を行う

この順序で、テンプレ感とスタイルのぶれを抑えられます。

## 標準フロー

1. 対象プロジェクトにスキルを導入:

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
```

2. スタイル基準を生成:

```bash
npx --yes getdesign@latest list
npx --yes getdesign@latest add linear --force
```

3. 固定プロンプトを使う:

```text
まず DESIGN.md でスタイルを固定し、その後 frontend-design でページを実装してください。
```

4. そのまま要件を渡して実装へ進めます。

## 曖昧プロンプトの自動収束

実装前に次の3モードへ分類します:

| モード | ユーザー発話例 | 期待する成果 |
|---|---|---|
| `Patch` | 「この要素だけ改善して」 | 局所改修 + すべての状態定義 |
| `Restyle` | 「Stripe風に作り直して」 | 情報構造を維持しつつ見た目を統一更新 |
| `Flow` | 「SaaS管理画面を一式作って」 | 画面間がつながる業務フローを提供 |

曖昧さを理由に停止せず、短い前提を明示して実装を進めます。

## デフォルトスタイル候補

- SaaS / B2B: `linear`, `vercel`, `supabase`
- マーケ/LP: `framer`, `stripe`, `notion`
- ドキュメント: `mintlify`, `hashicorp`, `mongodb`

業種ヒントがなければ `linear` から開始します。

## SaaS 交付の最低ライン

`Flow` 要件では最低限以下を含めます:

- ダッシュボード
- 一覧
- 詳細
- 作成/編集フォーム
- 設定または請求
- 主要状態: `loading`, `empty`, `error`, `success`
- 交互作用状態: `hover`, `focus`, `active`, `disabled`

## 推奨システムプロンプト

```text
ユーザー要件が曖昧な場合は、まず Patch/Restyle/Flow に分類してください。DESIGN.md でスタイルを固定してから実装し、hover/focus/active/disabled と loading/empty/error/success を必ず含めてください。
```

## 関連リンク

- [Rex ワークフロー移行](superpowers.md)
- [Skill Candidates Guide](skill-candidates.md)
- [高度デザインスキル実践（ブログ）](/blog/ja/advanced-design-skills-page-building/)

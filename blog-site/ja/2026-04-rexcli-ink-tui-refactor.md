---
title: "AIOS TUI リファクタリング：React Ink によるモダンなターミナルUI"
description: "AIOS は手動の文字列レンダリングから React Ink + Ink UI コンポーネントアーキテクチャへ TUI インストーラーを移行し、対話体験とコードメンテ性を向上させました。"
date: 2026-04-02
tags: [AIOS, TUI, Ink, React, Terminal, Onboarding]
---

# AIOS TUI リファクタリング：React Ink によるモダンなターミナルUI

これまでの TUI インストーラーは手動の文字列連結でインターフェースを描画しており、保守コストが高く対話体験もシンプルでした。今回のリファクタリングで **React Ink + Ink UI** コンポーネントアーキテクチャに移行し、ターミナルでの操作をよりモダンにします。

## なぜリファクタリングしたか

古い TUI 実装にはいくつかの問題がありました：

- 色やレイアウトのために ANSI 文字列を手動連結しており、一箇所を変えると他の場所にまで影響が広がりやすかった
- コンポーネント抽象化ががなく、状態管理が各处に散らばっていた
- ルーティングの概念がなく、画面遷移ロジックが散らばっていた

Ink はターミナル専用に設計された React レンダラーで、React コンポーネントパターンを使って CLI 操作インターフェースを記述できます。Ink UI の組み込みコンポーネント（`Select`、`TextInput`、`ConfirmInput`）を組み合わせることで、開発が大きく簡素化されます。

## 新アーキテクチャ

```
scripts/lib/tui-ink/
├── App.tsx              # MemoryRouter + Routes 設定
├── index.tsx            # render() エントリーポイント
├── hooks/
│   └── useSetupOptions.ts  # 共有設定状態
├── screens/
│   ├── MainScreen.tsx      # メインメニュー
│   ├── SetupScreen.tsx     # セットアップ設定
│   ├── UpdateScreen.tsx    # 更新設定
│   ├── UninstallScreen.tsx # アンインストール設定
│   ├── DoctorScreen.tsx    # Doctor 設定
│   ├── SkillPickerScreen.tsx # スキル選択
│   └── ConfirmScreen.tsx   # 実行確認
├── components/
│   ├── Header.tsx          # ヘッダー
│   ├── Footer.tsx          # フッターメニュー
│   ├── Checkbox.tsx        # チェックボックス
│   └── ScrollableSelect.tsx # スクロール選択リスト
└── types.ts               # 共有型定義
```

### ルートナビゲーション

画面切り替えは `react-router` の `MemoryRouter` で管理：

```
/ (MainScreen)
  → /setup
  → /update
  → /uninstall
  → /doctor

/setup → /skill-picker?owner=setup
/setup → /confirm?action=setup

/skill-picker → 前の画面に戻る
/confirm → 実行 → 結果表示 → メインメニューに戻る
```

### 状態管理

`useSetupOptions` フックが全局共有の設定状態を提供：

```typescript
interface SetupOptions {
  components: {
    browser: boolean;
    shell: boolean;
    skills: boolean;
    superpowers: boolean;
  };
  wrapMode: 'all' | 'repo-only' | 'opt-in' | 'off';
  scope: 'global' | 'project';
  client: 'all' | 'codex' | 'claude' | 'gemini' | 'opencode';
  selectedSkills: string[];
}
```

### カスタムコンポーネント

Ink UI の `Select` はスクロールウィンドウモードをサポートしていないため、`ScrollableSelect` を実装：

- キーボード ↑/↓ ナビゲーション
- Space キーで選択
- グループ表示対応（Core / Optional）
- スキル説明とインストール済みマーカー表示

## 依存ライブラリ

```bash
npm install ink @inkjs/ui react react-router
```

- `ink` 4.x — ターミナル用 React レンダラー
- `@inkjs/ui` — 組み込みインタラクティブコンポーネント
- `react` 18.x + `react-router` 7.x

Node バージョン：プロジェクト要件は `>=22 <23`、Ink 4.x は Node 18+ をサポートし完全互換。

## 視覚効果

- 現在の項目：太字 + cyan 色
- インストール済みマーカー：緑色 `(installed)`
- 説明テキスト：灰色 `dimColor`
- グループヘッダー：黄色または inverse
- エラー/成功：赤色/緑色

## 互換性

非対話モード（TTY なし）では従来の CLI 引数モードを維持：

```bash
aios setup --components browser,shell --scope global
aios update --client codex
aios doctor
```

エントリーポイントで TTY を検出し、自動的に Ink バージョンを呼び出します。

## 関連リンク

- Ink ドキュメント：<https://github.com/vadimdemedes/ink>
- Ink UI ドキュメント：<https://github.com/vadimdemedes/ink-ui>
- 設計ドキュメント：`docs/superpowers/specs/2026-04-02-ink-tui-design.md`
- 実装計画：`docs/superpowers/plans/2026-04-02-ink-tui-refactor.md`

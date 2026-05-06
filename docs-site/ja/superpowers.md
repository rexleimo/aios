---
title: Superpowers
description: CLI をより賢くする再利用可能な自動化スキル。使用シナリオ別に整理されています。
---

# Superpowers

Superpowers は、一般的なワークフローを自動化する再利用可能なスキルです。Claude Code、Codex、Gemini CLI、OpenCode にフックして、反復タスクを自動処理します。

同じコマンドやプロンプトを繰り返す代わりに、実績のあるワークフローで AI をナビゲートし、ベストプラクティスを適用し、完了前に結果を検証するスキルを呼び出します。

---

## 🚀 はじめに

新しい作業を明確さと構造を持って始めるためのスキル。

<div class="skill-grid">
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">💡</div>
      <div class="skill-card__name">brainstorming</div>
    </div>
    <div class="skill-card__desc">創造的な作業を始める前に、意図を確定させます。コンテキストを探索し、明確化質問を投げかけ、トレードオフ付きのアプローチを提案し、コーディング前にデザインを承認します。</div>
    <div class="skill-card__example">brainstorming でこの機能の実装方法を考える</div>
  </div>
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">📝</div>
      <div class="skill-card__name">writing-plans</div>
    </div>
    <div class="skill-card__desc">要件を実行可能な計画に変換します。要件を分析し、順序付きステップに分解し、依存関係を特定し、詳細な計画ドキュメントを出力します。</div>
    <div class="skill-card__example">writing-plans でこの要件をステップに分解する</div>
  </div>
</div>

---

## 🐛 デバッグと検証

推測ではなく証拠で品質を確保するためのスキル。

<div class="skill-grid">
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔍</div>
      <div class="skill-card__name">systematic-debugging</div>
    </div>
    <div class="skill-card__desc">証拠ベースでバグを修正します。症状とエラーメッセージを収集し、仮説を形成し、体系的にテストし、修正が有効か検証します。</div>
    <div class="skill-card__example">バグが発生したので、systematic-debugging を使う</div>
  </div>
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">✅</div>
      <div class="skill-card__name">verification-before-completion</div>
    </div>
    <div class="skill-card__desc">証拠なしに作業完了を主張しません。検証コマンドを実行し、出力が期待通りか確認し、成功を主張する前に具体的な証拠を要求します。</div>
    <div class="skill-card__example">完了前に verification-before-completion で検証する</div>
  </div>
</div>

---

## ⚡ 効率と協調

高速化と大規模な共同作業のためのスキル。

<div class="skill-grid">
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">⚡</div>
      <div class="skill-card__name">dispatching-parallel-agents</div>
    </div>
    <div class="skill-card__desc">複数の独立タスクを同時実行します。独立したワークフローを識別し、並列 agents を起動し、結果を統合し、失敗を適切に処理します。</div>
    <div class="skill-card__example">dispatching-parallel-agents でこれを並行処理する</div>
  </div>
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">👥</div>
      <div class="skill-card__name">team-ops</div>
    </div>
    <div class="skill-card__desc">HUD と Team 状態ツールでマルチ agent 協調を監視・管理します。リアルタイムのセッション状態を表示し、結果を追跡し、スキル改善候補を発見します。</div>
    <div class="skill-card__example">team-ops 監視パネルを確認する</div>
  </div>
</div>

---

## 🔒 セキュリティとコンプライアンス

自動化を安全に保つためのスキル。

<div class="skill-grid">
  <div class="skill-card skill-card--security">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔒</div>
      <div class="skill-card__name">security-scan</div>
    </div>
    <div class="skill-card__desc">自動化前に設定のセキュリティ問題をチェックします。skills、hooks、MCP 設定をスキャンし、露出したシークレットを特定し、修正を提案します。</div>
    <div class="skill-card__example">security-scan を実行して設定の安全性を確認する</div>
  </div>
</div>

---

## 使い方

1. **Superpowers が必要なら、自然に言う** — AI が意図を認識してスキルを起動します。
2. **スキルが自動的に実績のあるワークフローでナビゲート** します。
3. **結果はプロジェクトメモリに保存** され、後で参照できます。

### コマンド例

```
"brainstorming でこの機能の実装方法を考える"
"writing-plans でこの要件をステップに分解する"
"バグが発生したので、systematic-debugging を使う"
"完了前に verification-before-completion で検証する"
"dispatching-parallel-agents でこれを並行処理する"
"security-scan を実行して設定の安全性を確認する"
```

---

## RL トレーニングシステム

AIOS にはマルチ環境の強化学習システムが含まれています。統一制御プレーンを通じて、シェル、ブラウザ、オーケストレータータスク間で共有学生ポリシーを訓練します。

詳細は[アーキテクチャページ](architecture.md#rl-training-layer-aios)を参照してください。

---

## 続きを読む

- [ケース集](case-library.md) - 実例
- [ContextDB](contextdb.md) - 記憶がセッションを跨ぐ仕組み
- [Agent Team と HUD](team-ops.md) - マルチ agent 協調の詳細

---
title: Superpowers
description: CLI をより賢くする再利用可能な自動化スキル。使用シナリオ別に整理されています。
---

# Superpowers

> **Quick Answer:** Superpowers は brainstorming、planning、TDD、debugging、verification、parallel dispatch、security review の再利用可能な playbook です。先にワークフロールートを選び、その境界に合う最小の skill だけを使います。

## ルートの後に skill を選ぶ

読み取り専用の質問は direct のままで構いません。ファイルを変更する前の `pre-edit-safety-gate` と、完了を宣言する前の最終検証は、skill の選択とは独立したゲートです。

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

## RL トレーニングシステム

AIOS の RL 層は shell、browser、orchestrator のタスクを横断する実験・訓練の制御面です。公開ワークフローの編集ゲートや最終検証を置き換えるものではありません。

## FAQ

### Superpowers はすべての質問で起動しますか？

いいえ。質問や状態確認は direct のままで、設計、順序、デバッグ、委譲、完了証拠が必要なときに playbook を選びます。

### skill はどこにありますか？

リポジトリで発見可能な skill は `.codex/skills/` または `.claude/skills/` に置き、対応するワークフローがクライアントへ投影します。

## 正規ドキュメント

[ワークフローポリシー](workflow-policy.md)、[クイックスタート](getting-started.md)、[Agent Team](team-ops.md)から始めてください。

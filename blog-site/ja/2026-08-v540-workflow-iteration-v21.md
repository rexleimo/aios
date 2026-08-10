---
title: "v5.4.0：ワークフロー Iteration v2.1 — Activation 安全性、型付き Evidence コントラクト、全量 Skill 監査"
description: "AIOS v5.4.0 は、アトミックな Activation ステート、並行トークンロック、型付き Wayfinder/Planning Artifact スキーマ、厳格な evidence-ref 検証、S1–S5 全バッチ Skill 監査を追加します。"
date: 2026-08-01
tags: ["AIOS", "rex-harness", "ワークフロー", "evidence コントラクト", "activation store", "Skill 監査", "開発生産性"]
---

# v5.4.0：ワークフロー Iteration v2.1 — Activation 安全性、型付き Evidence コントラクト、全量 Skill 監査

> **要約：** v5.4.0 は、rex ワークフローランタイムにおける 3 種類のサイレント障害を解消します——クラッシュ後の Activation ステート分裂、並行実行下でのトークン二重消費、スキーマ検証を通過してしまう placeholder evidence ref。また、Wayfinder・Planning Artifact の完全な型付きスキーマを初めて提供し、全 13 の canonical Skill にわたる S1–S5 監査を完了しました。

## このリリースが解決する問題

coding agent がワークフロー途中で中断された場合——クラッシュ、ネットワーク切断、または並行呼び出しによって——2 つのことがサイレントに失敗することがあります。

1. Workflow ファイルと Activation プロジェクションファイルが同期から外れる可能性があります。トークンはローテートされたが、プロジェクションは古いコマンドを示したままです。agent は古いステートで再開します。
2. 2 つの並行呼び出しが同一の Command トークンを受け取ってどちらも成功し、ロック違反なしに重複した evidence 受理が発生します。

これらのどちらも、このリリース以前は明示的なエラーを出しませんでした。ワークフローはサイレントに進行（またはサイレントに停滞）するだけでした。

3 番目の障害は構造的なものです：Wayfinder と Planning Artifact の evidence `ref` フィールドが任意の文字列を受け付けており、`"TODO: fill in later"` やプロトコルプレフィックスのない裸のファイル名も通過しました。検証ゲートはパスし、agent は先に進み、レビュアーは使い物にならない参照を受け取りました。

## 変更点

### 先行書き込みトランザクションによるアトミックな Activation store

Activation store は、ライブステートに触れる前に pending トランザクションファイルを書き込むようになりました：

```
.aios/workflow-activations/transactions/<activationId>.json.pending
```

Workflow 書き込みと Activation プロジェクション書き込みの間でプロセスがクラッシュした場合、次回起動時に pending ファイルが検出され、トランザクションがロールフォワードされます。両方の書き込みが完了した場合、pending ファイルは最終ステップとして削除されます。ロールバックはなく、設計はロールフォワードのみです。

読み取り時、プロジェクションに記録された Command トークンが Workflow の現在のトークンと一致するかも検証するようになりました。乖離がある場合——旧コードでの 2 回の書き込みの間のクラッシュの兆候——読み取りは `stale-activation-projection` でフェイルクローズします。

### シングルトークン直列化ロック

per-store ファイルロックにより、2 つの並行呼び出しが同一の Command トークンを同時に進めることができなくなりました。2 番目の呼び出し元は `AIOS_REX_STORE_BUSY` を受け取り、リトライが必要です。ロックはアトミック書き込みの間のみ保持されるため、通常の順次使用には影響しません。

### 型付き Wayfinder・Planning Artifact スキーマ

このリリースでは 2 つの新しいドメインモジュールが追加されます：

- `src/domain/wayfinder-artifact.mjs` — Navigation Map、Decision Graph、Decision Ticket、Next Slice を検証。`partial` または `blocked` の Wayfinder artifact は Decision Ticket または Next Slice を宣言できません。
- `src/domain/planning-artifact.mjs` — Delivery Ticket、Frontier（ready と blocked は相互排他で重複なし）、Parallel Group（作業項目は複数のグループに現れることができない）、Convergence Gate、Runtime Artifact Contract を検証。

両スキーマは `normalizeEvidenceRefs()` を経由し、プロトコルプレフィックス（`artifact:`、`receipt:`、`diff:`、`command:` 等）が欠けているか、既知の placeholder パターン（`TODO`、`TBD`、`placeholder` 等）に一致する `evidenceRef` を拒否します。

### 信頼できるバックアップリカバリ

Client projection の `recoverInterruptedArtifacts` は、バックアップを昇格させる前に `projection-history.json` でバックアップマーカーダイジェストを再検証するようになりました。管理された projection によって作成されていないか、マーカーが改ざんされたバックアップ junction は `interrupted-backup-untrusted` で拒否されます。

### Plan evidence mirror 障害の可視性

`syncEvidenceToMatchingPlan` は、プランファイルが見つからない・不一致の場合に例外を投げていました。これは、コミット済みの Rex ステートが呼び出し元には全体的な失敗として見えることを意味していました。現在は構造化エラーコード付きの `planEvidence.status = 'failed'` を返すため、呼び出し元は「Rex が evidence を受理した」と「plan mirror が失敗した」を区別できます。

### S1–S5 Skill 監査

全 13 の canonical Skill source が S1–S5 バッチ SkillOpt eval を完了しました：

| バッチ | Skills |
|---|---|
| S1 | `rex-requirements`, `rex-implement` |
| S2 | `rex-debug`, `rex-tdd` |
| S3 | `rex-wayfinder`, `rex-planning` |
| S4 | `rex-code-review` |
| S5 | `rex-design`, `rex-strict-tdd`, `rex-refactor-hardening`, `rex-minimal-construction`, `rex-test-design`, `rex-workflow` |

## アップグレードノート

- `rex-harness` は `0.4.3` から `0.5.0` にバンプします。`recoverInterruptedArtifacts` を直接使用している場合は呼び出し元を更新してください：第 2 引数は裸の `skillId` 文字列ではなく `plan` オブジェクト `{ skillId, sourceDigest, historicalDigests }` になりました。
- 既存の `.aios/workflow-activations/` ステートは読み取り互換です。移行は不要です。
- ワークフローステートに既に保存されている evidence ref は遡及的に再検証されません。更新されたランタイムを通じて提出された新しい evidence にはプロトコルプレフィックスルールが適用されます。

## 検証

```bash
npm run test:rex
# rex 191/191  contract 38/38  integration 52/52  workflow-policy 74/74
```

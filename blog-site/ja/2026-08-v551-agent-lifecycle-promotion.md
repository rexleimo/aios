---
title: "v5.5.1：証拠駆動の Agent ライフサイクル昇格"
description: "v5.5.1 は Agent 昇格のハードコードされたボトルネックを解消し、全 canonical role を smoke 対象にして、検証済み evidence で live workflow へ昇格します。"
date: 2026-08-08
tags: ["Harness CLI", "agents", "smoke", "workflow", "release"]
---

# v5.5.1：証拠駆動の Agent ライフサイクル昇格

v5.5.0 では Agent の live smoke evidence を導入しましたが、catalogue には六つの Agent だけを許可するハードコードされた昇格リストが残っていました。有効な smoke、provenance、双方向 metrics が揃っていても candidate のままになる問題です。

## 変更点

- `agents smoke` は全 19 canonical Agent role をデフォルトで対象にします。
- managed evidence が検証済みなら、canonical Agent は `projected` に昇格します。
- 不正または不足した evidence は引き続き fail-closed です。
- status は Agent blocker と quality-gate blocker を区別します。
- macOS の `/var` と `/private/var` のパス差異をテストで canonicalize します。

## 検証

Codex による全 19 Agent の smoke が成功しました。Rex workflow policy は 74/74、Rex integration は 52/52、ルートの全テストは 1023 passed、10 skipped、0 failed です。

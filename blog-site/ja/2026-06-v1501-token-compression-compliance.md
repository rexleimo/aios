---
title: "v1.50.1: All-Client Token Compression Compliance"
description: "AIOS v1.50.1 は pre_send、post_receive、proof matrix、direct host bypass の違反記録で、すべての AIOS client の token savings を計測可能にします。"
date: 2026-06-05
tags: ["release", "token-compression", "AIOS", "multi-client", "proof"]
---

# v1.50.1: All-Client Token Compression Compliance

Token savings は感覚ではなく証拠で確認する必要があります。Agent の回答が短いだけでは不十分です。AIOS を bypass した raw host output も savings ではありません。1 つの harness proof だけでは、すべての client が同じ contract に従うとは言えません。

AIOS v1.50.1 は共有 metric `bidirectional-turn-compression` でこの gap を閉じます。

## Contract

すべての AIOS-managed agent turn には 2 つの必須 compression point があります。

- `pre_send`: prompt/input が target client または model に届く前に圧縮する。
- `post_receive`: client/model output を AIOS が受け入れる前に圧縮する。

Client capability report は次も要求します。

- `requiredEntrypoint=aios-managed-runner`
- `directHostBypassAllowed=false`
- `uncontrolledHostOutput=policy-violation`

対象は Codex、Claude、Gemini、Antigravity、OpenCode、Crush、Cursor、`aios-harness`、`generic-mcp` です。

## Proof, Not Prompts

```bash
node scripts/aios.mjs interception proof --json
node scripts/aios.mjs clients doctor --json
```

proof JSON には `turn_compression_matrix` が含まれます。各 row は client/host の `pre_send` と `post_receive` について `saved_bytes`、`saving_ratio`、compliance status を示します。

Text doctor も共有 metric を表示します。

```text
compression=bidirectional-turn-compression entrypoint=aios-managed-runner pre_send=required post_receive=required bypass=policy-violation
```

## Fake Savings をしない

AIOS-managed turn boundary 外の output は uncontrolled host output として記録されます。

- `policy_violation=true`
- `compliance_status=non_compliant`
- `saved_bytes=0`
- `saving_ratio=0`

## Skill Training Evidence

`aios-interception-runtime` skill はこの release で SkillOpt-Lite training を受けました。accepted patch は skip discipline を追加し、Windows-only platform skip と token-compression gap を混同しないようにしました。

Artifact:

```text
.skillopt/aios-interception-runtime-2026-06-05
```

Reference: [Token インテリジェンスと圧縮](https://cli.rexai.top/ja/token-compression/)

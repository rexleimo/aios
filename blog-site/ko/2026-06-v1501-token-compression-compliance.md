---
title: "v1.50.1: All-Client Token Compression Compliance"
description: "Harness CLI v1.50.1은 pre_send, post_receive, proof matrix, direct host bypass 위반 기록으로 모든 AIOS client의 token savings를 측정 가능하게 합니다."
date: 2026-06-05
tags: ["release", "token-compression", "AIOS", "multi-client", "proof"]
---

# v1.50.1: All-Client Token Compression Compliance

Token savings는 느낌이 아니라 증거로 확인해야 합니다. Agent 답변이 짧아졌다고 충분하지 않습니다. AIOS를 bypass한 raw host output도 savings가 아닙니다. harness 하나만 증명해도 모든 client가 같은 contract를 따르는 것은 아닙니다.

Harness CLI v1.50.1은 공유 metric `bidirectional-turn-compression`으로 이 gap을 닫습니다.

## Contract

모든 AIOS-managed agent turn에는 두 개의 필수 compression point가 있습니다.

- `pre_send`: prompt/input이 target client 또는 model에 도달하기 전에 압축합니다.
- `post_receive`: client/model output을 AIOS가 받아들이기 전에 압축합니다.

Client capability report는 다음도 요구합니다.

- `requiredEntrypoint=aios-managed-runner`
- `directHostBypassAllowed=false`
- `uncontrolledHostOutput=policy-violation`

대상은 Codex, Claude, Gemini, Antigravity, OpenCode, Crush, Cursor, `aios-harness`, `generic-mcp`입니다.

## Proof, Not Prompts

```bash
node scripts/aios.mjs interception proof --json
node scripts/aios.mjs clients doctor --json
```

proof JSON에는 `turn_compression_matrix`가 포함됩니다. 각 row는 client/host의 `pre_send`와 `post_receive`에 대해 `saved_bytes`, `saving_ratio`, compliance status를 보여줍니다.

Text doctor도 공유 metric을 표시합니다.

```text
compression=bidirectional-turn-compression entrypoint=aios-managed-runner pre_send=required post_receive=required bypass=policy-violation
```

## Fake Savings 없음

AIOS-managed turn boundary 밖의 output은 uncontrolled host output으로 기록됩니다.

- `policy_violation=true`
- `compliance_status=non_compliant`
- `saved_bytes=0`
- `saving_ratio=0`

## Skill Training Evidence

`aios-interception-runtime` skill은 이번 release에서 SkillOpt-Lite training을 받았습니다. accepted patch는 skip discipline을 추가해 Windows-only platform skip을 token-compression gap과 혼동하지 않게 했습니다.

Artifact:

```text
.skillopt/aios-interception-runtime-2026-06-05
```

Reference: [Native Token Compression](https://cli.rexai.top/ko/token-compression/#all-client-turn-compression-v1501)

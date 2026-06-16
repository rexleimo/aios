---
title: "Agent Governance: Team live 실행 전에 증거 남기기"
description: "Harness CLI가 smoke 증거, provenance, token-compression metrics, skill training gate로 많은 agents를 하나의 workflow에 통합하는 방법."
date: 2026-06-16
tags: ["Agent Team", "governance", "smoke", "skills", "AIOS"]
---

# Agent Governance: Team live 실행 전에 증거 남기기

agents를 더 추가하는 일은 어렵지 않습니다. 어려운 일은 실제 workflow 안에서 신뢰할 수 있을 만큼 안전하게 만드는 것입니다.

Harness CLI는 agent routing, team execution, skill update를 evidence 문제로 다룹니다. workflow가 live로 들어가기 전에 세 가지를 증명해야 합니다.

1. agent가 smoke path를 실행할 수 있음,
2. 실행이 provenance와 token-compression metrics를 남김,
3. skill이 변경되었다면 training gate를 통과함.

## 왜 governance가 필요한가

multi-agent system은 보통 지루한 방식으로 실패합니다.

- client capability 검증 전에 어떤 role이 live work를 시작함,
- skill이 바뀌었지만 새 instruction이 training 되었는지 확인하지 않음,
- output compression이 일부 agent에서만 동작함,
- team run은 성공처럼 보이지만 나중에 audit할 evidence가 없음.

해답은 agents를 줄이는 것이 아닙니다. agent admission을 지루하고 반복 가능하며 fail-closed인 절차로 만드는 것입니다.

## 새로운 workflow

routing, docs, skills, team behavior를 바꿀 때는 dry-run preview로 시작하세요.

```bash
node scripts/aios.mjs agents smoke --dry-run --json
```

그 다음 active agent set의 smoke evidence를 기록합니다.

```bash
node scripts/aios.mjs agents smoke --json
```

변경이 skills를 건드렸다면 workflow를 ready로 보기 전에 training gate를 실행합니다.

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

운영 규칙은 단순합니다. team과 harness workflow는 확장할 수 있지만, 신뢰되기 전에 evidence를 남겨야 합니다.

## 무엇이 기록되나

각 core-risk agent는 세 가지 evidence file을 얻습니다.

| Evidence | Path | Purpose |
|---|---|---|
| Smoke result | `.aios/agents/smoke/<agent>.json` | agent가 smoke path를 통과했음을 보여줌 |
| Provenance | `.aios/agents/provenance/<agent>.json` | 어떤 agent/client path가 evidence를 만들었는지 기록 |
| Compression metrics | `.aios/interception/metrics/agents-smoke-<agent>.jsonl` | `pre_send`와 `post_receive` token-compression accounting에 agent identity가 포함되는지 확인 |

핵심은 `agent_id`입니다. 안정적인 agent identity가 없는 metrics는 audit하기 어렵기 때문에 smoke evidence는 그 identity를 compression data plane까지 전달합니다.

## 일상 업무에서의 적용

governance path는 다음 상황에서 사용하세요.

- agent role 추가 또는 rename,
- team, harness, subagent routing 변경,
- workflow skills 수정,
- native client instructions 업데이트,
- agent orchestration behavior를 바꾸는 release 준비.

일반 feature work에서는 user-facing flow를 그대로 유지합니다.

```bash
aios team 3:codex "settings page 구현, tests 추가, docs 업데이트"
aios team status --provider codex --watch
```

governance checks는 이 흐름 뒤에서 동작하며, 사용자가 team surface에 의존하기 전에 준비 상태를 확인합니다.

## Skill 변경에는 training이 필요하다

Skills는 단순한 documentation이 아니라 실행 가능한 operating procedure입니다. skill이 바뀌면 changed skill이 training gate를 통과했는지 검증해야 합니다.

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

이 command는 warning이 아니라 gate입니다. training evidence가 없다면 workflow는 멈춰야 하며, 새 instruction에 live agent work를 의존시키면 안 됩니다.

## 운영 원칙

더 큰 agent system의 규칙은 간단합니다.

> admission, provenance, compression, training이 observable할 때만 더 많은 agents를 받아들인다.

이것이 Harness CLI가 더 많은 agents를 하나의 system workflow에 통합하는 방식입니다. team run을 trust fall로 만들지 않습니다.

---

일상 command와 governance checklist는 업데이트된 [Agent Team docs](https://cli.rexai.top/ko/team-ops/)를 참고하세요.

---
title: "ContextDB Token Compression: 더 작은 컨텍스트 패킷과 안전한 recall"
description: "ContextDB context:pack 은 token 예산 안에서 노이즈 이벤트 기록을 먼저 압축하고, 그다음 낮은 우선순위 이벤트를 제거할 수 있습니다."
date: 2026-05-12
tags: ["ContextDB", "token compression", "context pack", "AI memory", "RexCLI"]
---

# ContextDB Token Compression: 더 작은 컨텍스트 패킷과 안전한 recall

장시간 agent 세션은 유용한 기억을 만들지만 raw history 는 빠르게 비용이 커집니다. prompt, tool log, stack trace, checkpoint 를 모두 그대로 넣으면 다음 agent 실행이 불필요한 token 까지 지불하게 됩니다.

## 빠른 답변

ContextDB `context:pack` 은 이제 **token compression** 을 지원합니다. token 예산과 strategy 를 지정하면 낮은 우선순위 이벤트를 제거하기 전에 노이즈가 많은 이벤트 텍스트를 압축합니다. 최신 이벤트, 오류, 파일 참조, 명령, next action 신호가 먼저 보호되므로 작은 패킷도 유용한 recall 을 유지합니다.

[공식 ContextDB 문서 읽기](https://cli.rexai.top/ko/contextdb/#token-compression){ .md-button .md-button--primary }

## 바로 사용하기

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<id>-compressed.md
```

일반적으로는 `balanced` 를 사용하세요. 매우 작은 패킷이 필요하면 `aggressive`, 이전 tail-window 동작을 확인하려면 `legacy` 를 사용합니다.

## 무엇이 바뀌었나

이전의 예산 제한 패킷은 주로 tail window 처럼 동작했습니다. 새로운 경로는 반복 로그, 긴 출력, stack trace 를 안전하게 압축하고, 그래도 예산을 넘을 때만 낮은 우선순위 이벤트를 제거합니다.

| Strategy | Best for | Behavior |
|---|---|---|
| `balanced` | 일상 사용 | 노이즈를 압축하고 최신/고신호 이벤트를 보호. |
| `aggressive` | 작은 예산 | 더 엄격한 줄 수와 길이 제한 적용. |
| `legacy` | 호환성 확인 | 이전 tail-only 선택을 사용하고 압축하지 않음. |

`Event Window` 줄에는 `tokenBudget`, `tokenUsed`, `rawTokenUsed`, `compressed`, `dropped`, `truncated` 가 표시되어 token 절감이 압축 때문인지 이벤트 제거 때문인지 확인할 수 있습니다.

## FAQ

### Search 를 대체하나요?

아니요. Search 는 특정 과거 이벤트를 찾기 위한 기능입니다. Token compression 은 선택된 세션 창을 다음 prompt packet 에 맞추기 위한 기능입니다.

### 중요한 오류가 사라지지 않나요?

기본 strategy 는 고신호 단어, file path, error, 최신 이벤트를 보호합니다. 압축본이 충분한 signal 을 남기지 못하면 해당 이벤트는 원문으로 유지됩니다.

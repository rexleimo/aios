---
title: "네이티브 Token 압축: Harness CLI가 RTK나 Caveman을 설치하지 않는 이유"
date: 2026-05-12
tags: ["AIOS", "token compression", "ContextDB", "skills", "Harness CLI"]
description: "Harness CLI는 ContextDB 입력 압축, 브라우저의 압축 읽기, CLI 출력 범위 제한, 출력 압축 스킬을 자체 구현하며 경쟁 도구에 의존하지 않습니다."
---

# 네이티브 Token 압축: Harness CLI가 RTK나 Caveman을 설치하지 않는 이유

Token 비용은 단순한 과금 문제가 아닙니다. 안정성 문제이기도 합니다.

긴 AI 코딩 세션은 전체 로그, 반복 stack trace, 페이지 boilerplate, 장황한 상태 보고 때문에 쉽게 망가집니다. 가장 쉬운 지름길은 경쟁 token 도구를 설치하는 것입니다. Harness CLI는 그 방식을 선택하지 않았습니다.

RTK 스타일의 입력 필터링과 Caveman 스타일의 짧은 출력이라는 아이디어만 참고하고, 실제 동작은 AIOS 안에서 자체 구현합니다.

## 무엇이 바뀌었나

Harness CLI는 token 절감을 두 개의 네이티브 레이어로 나눕니다.

1. **입력 압축**: 명령, 브라우저, ContextDB payload가 모델에 들어가기 전에 노이즈를 줄입니다.
2. **출력 압축**: 정확한 명령, 경로, 오류, 위험 경고를 유지하면서 Agent 답변을 짧게 만듭니다.

RTK를 설치하지 않습니다. Caveman도 설치하지 않습니다. 사용자 명령을 전역으로 바꾸는 shell hook도 없습니다.

## 네이티브 입력 압축

ContextDB에는 자체 token strategy engine이 있습니다.

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

기본 전략은 보수적입니다.

- 반복 줄과 stack-run 노이즈를 압축합니다.
- 중요한 오류, 파일 경로, 명령, 최신 상태를 보존합니다.
- 보호된 이벤트를 자르기 전에 낮은 우선순위 이벤트를 먼저 버립니다.
- `strategy`, `rawTokenUsed`, `compressed`, `dropped`, `truncated` telemetry를 출력합니다.

브라우저 작업에서는 새로운 `aios-browser-compress` 스킬이 압축된 읽기 순서를 권장합니다.

1. `page.semantic_snapshot`
2. targeted `page.extract_text`
3. full `page.extract_text`
4. `page.get_html`
5. 시각 증거가 필요할 때만 screenshot

CLI 작업에서는 전체 덤프보다 `rg`, `git diff --stat`, `sed -n`, `head`, `tail`, 특정 테스트 selector를 우선합니다.

## 네이티브 출력 압축

새로운 `aios-compress` 스킬은 세 가지 레벨을 정의합니다.

| 레벨 | 사용 사례 | 동작 |
|------|-----------|------|
| `tight` | 일반 코딩 작업 | 짧은 기술 답변, 군더더기 없음 |
| `ultra` | harness 로그, checkpoint | 한 줄 증거 + 다음 행동 |
| `precise` | 브라우저 작업, 안전, 되돌릴 수 없는 단계 | 완전하고 명시적인 표현 |

핵심 규칙은 압축이 위험을 숨기면 안 된다는 것입니다. 오류, 명령, 경로, selector, 날짜, 검증 공백은 정확하게 유지합니다.

## 왜 경쟁 도구를 설치하지 않나

다른 token 도구를 설치하는 것은 빨라 보이지만 숨은 결합을 만듭니다.

- 명령 동작이 Harness CLI 통제 밖에서 바뀔 수 있습니다.
- Codex, Claude, Gemini, opencode 간 동작 일관성을 맞추기 어렵습니다.
- 문서 검증이 어려워집니다.
- 사용자에게 의존성, 업데이트 경로, 실패 모드가 추가됩니다.

네이티브 구현은 감사 가능합니다. 코드, 스킬, 문서가 모두 저장소 안에 있습니다.

## 사용 방법

ContextDB packet:

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

Agent 출력:

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

브라우저 자동화에서는 전체 페이지 텍스트보다 semantic snapshot과 targeted extraction을 먼저 사용합니다.

## 결론

Harness CLI의 token 절감은 이제 네이티브입니다. 입력 압축은 ContextDB와 브라우저 workflow가 담당하고, 출력 압축은 AIOS skill이 담당하며, 경쟁 도구 설치 단계는 없습니다.

긴 Agent 작업을 더 저렴하고, 조용하고, 검증 가능하게 만듭니다.

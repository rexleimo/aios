---
title: "Model Router: 어떤 AI 모델을 사용할지 더 이상 고민하지 마세요"
description: "작업 설명을 읽고 자동으로 최적의 AI 모델을 선택하는 디스패치 레이어. 더 이상 모델의 강점을 외울 필요가 없습니다."
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "AIOS"]
---

# Model Router: 어떤 AI 모델을 사용할지 더 이상 고민하지 마세요

이런 경험 있으시죠: 작업이 있는데, 어떤 AI 모델을 사용해야 할지 모르겠는 상황. Claude Opus? DeepSeek? GPT-5.5? 각자 다른 것을 잘하고, 잘못 고르면 시간과 비용이 낭비됩니다.

**라우팅이 자동으로 이루어진다면 어떨까요?**

Model Router 는 작업 설명을 읽고, 어떤 종류의 작업인지 감지하고, 그 작업에 가장 뛰어난 모델로 보냅니다.

## 해결하는 문제

Model Router 가 없다면, 라우팅은 이렇게 됩니다:

| 여러분이 말하는 것 | 어떤 모델? | 이유 |
|---|---|---|
| "랜딩 페이지 만들어줘" | ??? | 프론트엔드? UI? 디자인? |
| "이 코드 보안 리뷰해줘" | ??? | Claude Opus? GPT-5.5? |
| "프로덕션 장애 복구해줘" | ??? | 이건 코딩이 아니라 ops 인데 |
| "로그인 엔드포인트 구현해줘" | ??? | DeepSeek 인 것 같은데, 아닐 수도? |

모든 모델의 강점을 외우고 CLI 를 수동으로 전환해야 합니다. Model Router 를 사용하면 작업을 설명하기만 하면 됩니다:

```bash
node scripts/aios.mjs model-router route \
  --task "아름다운 랜딩 페이지 컴포넌트 만들어줘" \
  --explain
```

결과: `frontend → kimi-k2.6` ("랜딩 페이지", "컴포넌트", "아름다운" 이 프론트엔드 작업을 나타내기 때문).

## 어떻게 선택하는지

Model Router 는 작업 설명에서 **신호** 를 찾습니다 — 어떤 종류의 작업인지 나타내는 키워드:

| 언급하는 내용 | 감지 결과 | 라우팅 대상 | 이유 |
|---|---|---|---|
| "browser", "upload", "screenshot" | 브라우저 자동화 | GPT-5.5 | 도구 사용 추론에 가장 뛰어남 |
| "security", "vulnerability", "auth" | 보안 리뷰 | Claude Opus | 가장 강력한 리뷰어 |
| "frontend", "UI", "component" | 프론트엔드 작업 | Kimi K2.6 | UI 작업에 가장 뛰어남 |
| "production", "incident", "logs" | 자가 치유 | MiniMax-M2.7 | ops 복구에 특화 |
| "long document", "research" | 리서치 | Gemini-3-Pro | 1M 컨텍스트 윈도우 |
| "implement", 일반 코딩 | 구현 | DeepSeek-V4 | 저렴하고 빠름 |

`--explain` 을 추가하면 어떤 신호가 매치되었고 왜 그렇게 라우팅되었는지 정확히 볼 수 있습니다.

## Before/After 비교

Balanced v2 라우터에서 바뀐 점:

| 작업 | 이전 (구 라우터) | 이후 (Balanced v2) |
|---|---|---|
| "Xiaohongshu 열어서 이미지 업로드" | implementation → DeepSeek | browser-automation → GPT-5.5 |
| "아름다운 랜딩 페이지 만들어줘" | implementation → DeepSeek | frontend → Kimi K2.6 |
| "프로덕션 로그인 장애 복구해줘" | research → Gemini | self-healing → MiniMax-M2.7 |
| "새 로그인 엔드포인트 구현해줘" | implementation → DeepSeek | implementation → DeepSeek (정확함!) |

핵심 인사이트: **일반적인 구현은 저렴하게 유지** 되지만 (DeepSeek), 분명히 특화된 모델이 필요한 작업은 자동으로 업그레이드됩니다.

## 라우팅 프로필

라우팅이 얼마나 적극적인지 제어하는 세 가지 모드:

| 프로필 | 사용 시기 | 동작 |
|---|---|---|
| `balanced` (기본값) | 대부분의 작업 | 강한 신호는 업그레이드, 일반 코딩은 저렴하게 유지 |
| `premium` | 위험하거나 불명확한 작업 | 비싼 모델을 더 자주 사용 |
| `budget` | 비용에 민감한 작업 | 정말 강력한 모델이 필요하지 않은 한 저렴한 모델 선호 |

```bash
# 명령어별 지정
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# 또는 전체 세션에 적용
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 직접 해보세요

```bash
# 사용 가능한 모든 모델 보기
node scripts/aios.mjs model-router list

# 작업을 라우팅하고 이유 확인
node scripts/aios.mjs model-router route \
  --task "여기에 작업 설명" \
  --profile balanced \
  --explain

# 최근 라우팅 기록 보기
node scripts/aios.mjs model-router stats
```

## Agent Team 과 함께 사용

Model Router 는 Agent Team 에 내장되어 있습니다 — 팀 실행의 각 단계가 자동으로 최적의 모델로 라우팅됩니다. 따로 설정할 필요가 없습니다.

---

*Model Router 는 [Harness CLI](https://cli.rexai.top) 의 일부입니다. 모든 모델, 규칙, 설정 옵션은 [전체 문서](https://cli.rexai.top/ko/model-router/)를 참조하세요.*

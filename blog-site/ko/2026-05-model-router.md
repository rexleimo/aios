---
title: "Model Router: Agent Team 을 위한 지능형 멀티모델 디스패치"
description: "Model Router 소개 — 능력, 비용, 성공률에 따라 하위 작업을 최적 모델에 매칭하고 CLI 프로토콜을 자동 선택하는 지능형 디스패치 레이어."
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "orchestration", "dispatch", "AIOS"]
---

# Model Router: Agent Team 을 위한 지능형 멀티모델 디스패치

모든 coding agent 는 서로 다른 강점을 가지고 있습니다. Claude Opus 는 코드 리뷰와 아키텍처 설계에 뛰어납니다. DeepSeek-V4 는 빠르고 저렴하게 구현 작업을 처리합니다. Gemini-3-Pro 는 100만 토큰의 연구 문서를 다룰 수 있습니다. GPT-5.5 는 모든 작업을 훌륭하게 해내는 올라운더입니다.

하지만 문제가 있습니다: **오케스트레이터가 어떤 모델이 어떤 작업에 최적인지 기억해야 하고**, 각 모델의 CLI 명령어도 정확히 알아야 합니다. `claude --model <name>` vs `codex --yolo -m <name>` vs `gemini -m <name>`. 8개 모델, 12가지 작업 유형, 비용 고려 폴백 체인 — 도구 없이는 어떤 사람(또는 에이전트)도 전부 기억할 수 없습니다.

**Model Router** 는 에이전트가 직접 호출할 수 있는 간단한 디스패치 레이어로 이 문제를 해결합니다.

## 작동 방식

Model Router 는 4단계 파이프라인입니다:

1. **분석** — 하위 작업 설명을 읽고 작업 유형(코드 리뷰, 구현, 리서치 등)에 매칭
2. **라우팅** — 능력 매칭으로 기본 모델을 선택하고 비용 오름차순 폴백 체인을 부여
3. **디스패치** — 모델의 제공자(claude/codex/gemini)에 따라 올바른 CLI 명령을 생성
4. **학습** — 디스패치 결과를 ContextDB 에 기록하여 성공률 피드백으로 활용

```bash
# 설명에서 작업 유형 자동 감지
node scripts/aios.mjs model-router route --task "Review auth.js for security vulnerabilities"
# → security-review → Claude Opus (기본)
# → 폴백 체인: GPT-5.5 → GLM-5.1

node scripts/aios.mjs model-router route --task "Implement a user login endpoint"
# → implementation → DeepSeek-V4 (기본)
# → 폴백 체인: GPT-5.5 → Claude Sonnet

node scripts/aios.mjs model-router route --task "Research React 19 migration strategies"
# → research → Gemini-3-Pro (기본)
# → 폴백 체인: GPT-5.5 → Kimi K2.6
```

## 모델 능력 레지스트리

라우터는 8개 모델의 능력 레지스트리와 함께 제공됩니다:

| 모델 | 최적 용도 | 비용 |
|------|---------|------|
| **Claude Opus 4.7** | 코드 리뷰, 아키텍처, 보안 감사 | 최고 |
| **Claude Sonnet 4.6** | 일상 개발, RAG, 빠른 프로토타입 | 중간 |
| **GPT-5.5** | 올라운더: 자동화, 추론, 범용 | 최고 |
| **DeepSeek-V4-Pro** | 알고리즘, 핵심 로직, 배치 처리 | 최저 |
| **GLM-5.1** | 수학 추론, 자율 루프, 시스템 계획 | 낮음 |
| **Kimi K2.6** | 멀티에이전트 편성, 프론트엔드 UI | 낮음 |
| **MiniMax-M2.7** | 자가 치유, 프로덕션 복구 | 낮음 |
| **Gemini-3-Pro** | 멀티모달 분석, 장문 연구, 1M 컨텍스트 | 중간 |

## 세 가지 CLI 프로토콜, 자동 선택

| 프로토콜 | CLI 템플릿 | 사용 대상 |
|----------|-----------|---------|
| **codex** | `codex --yolo -m <model> -p "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | 그 외 모든 모델 |

더는 `-m` 인지 `--model` 인지 헷갈릴 필요가 없습니다.

## 환경 변수 오버라이드

```bash
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus
```

해결 우선순위: **환경 변수** > **preferredModel** (에이전트 카드) > **model** (폴백).

## 피드백 루프

모든 디스패치는 `model.dispatch` 이벤트로 기록됩니다:

```json
{
  "kind": "model.dispatch",
  "modelId": "claude-opus",
  "taskType": "code-review",
  "success": true,
  "latencyMs": 4500,
  "costEstimate": "high"
}
```

## 빠른 시작

```bash
# 모든 모델과 능력 보기
node scripts/aios.mjs model-router list

# 작업을 최적 모델로 라우팅
node scripts/aios.mjs model-router route --task "당신의 작업"

# 디스패치 통계 보기
node scripts/aios.mjs model-router stats
```

Model Router 는 RexCLI v1.8.0 이상에서 사용할 수 있습니다. 자세한 내용은 [공식 문서](https://cli.rexai.top/ko/model-router/)를 참조하세요.

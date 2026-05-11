---
title: 모델 라우터
description: 멀티모델 Agent Team을 위한 지능형 모델 디스패치 — 능력, 비용, 성공률에 따라 작업을 최적의 모델에 매칭합니다.
---

# 모델 라우터

> 각 모델의 CLI 명령어를 외우지 마세요. Agent가 작업을 올바른 모델로 자동 라우팅하도록 가르치세요.

모델 라우터는 멀티모델 Agent Team을 위한 지능형 디스패치 레이어입니다. 모델 능력 레지스트리를 유지하고, 하위 작업을 최적의 모델에 매칭하며, 올바른 프로토콜로 CLI 명령을 생성하고, 인식 피드백 루프를 통해 디스패치 이력에서 학습합니다.

## 모델 능력 레지스트리

| 모델 | 프로토콜 | 강점 | 비용 |
|------|----------|------|------|
| **Claude Opus 4.7** | claude | 코드 리뷰, 아키텍처 설계, 보안 감사 | 최고 |
| **Claude Sonnet 4.6** | claude | 일상 개발, RAG, 빠른 프로토타입 | 중간 |
| **GPT-5.5** | codex | 올라운더: 자동화, 추론, 코드 실행 | 최고 |
| **DeepSeek-V4-Pro** | claude | 알고리즘, 핵심 로직, 배치 처리 | 최저 |
| **GLM-5.1** | claude | 수학 추론, 자율 루프, 시스템 계획 | 낮음 |
| **Kimi K2.6** | claude | 멀티에이전트 오케스트레이션, 프론트엔드, 장기 실행 | 낮음 |
| **MiniMax-M2.7** | claude | 자가 치유, 프로덕션 복구 | 낮음 |
| **Gemini-3-Pro** | gemini | 멀티모달 분석, 장문 연구, 1M 컨텍스트 | 중간 |

## CLI 프로토콜

| 프로토콜 | CLI | 사용 대상 |
|----------|-----|---------|
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | 그 외 모든 모델 |

Codex live worker는 기본적으로 `--dangerously-bypass-approvals-and-sandbox`(기존 `--yolo`에 해당)를 붙여 background subagent가 approval/sandbox prompt에서 멈추지 않게 합니다. 수동 디버깅 시에만 `AIOS_SUBAGENT_CODEX_UNATTENDED=0`으로 끄세요.

## 라우팅 규칙

| 작업 유형 | 기본 모델 | 폴백 체인 |
|----------|----------|----------|
| 코드 리뷰 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 보안 감사 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 아키텍처 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 구현 | DeepSeek-V4 | GPT-5.5 → Claude Sonnet |
| 브라우저 자동화 | GPT-5.5 | Kimi K2.6 → Claude Sonnet |
| 리서치 | Gemini-3-Pro | GPT-5.5 → Kimi K2.6 |
| 계획 | GLM-5.1 | GPT-5.5 → Claude Opus |
| 테스트 | Claude Sonnet | GPT-5.5 → DeepSeek-V4 |
| 문서 | Claude Sonnet | GPT-5.5 → Kimi K2.6 |
| 프론트엔드 | Kimi K2.6 | GPT-5.5 → Claude Sonnet |
| 자가 치유 | MiniMax-M2.7 | GLM-5.1 → GPT-5.5 |
| 범용 | GPT-5.5 | Claude Sonnet → DeepSeek-V4 |

## 빠른 시작

```bash
# 레지스트리 보기
node scripts/aios.mjs model-router list

# 작업을 최적의 모델로 라우팅
node scripts/aios.mjs model-router route --task "auth.js 보안 검토"

# 디스패치 통계 보기
node scripts/aios.mjs model-router stats
```

## 환경 변수 오버라이드

```bash
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
```

## 설정 파일

| 파일 | 용도 |
|------|------|
| `memory/specs/model-registry.json` | 모델 능력, 라우팅 규칙, CLI 프로토콜 설정 |
| `memory/specs/orchestrator-agents.json` | Agent 역할→preferredModel 매핑 |
| `.claude/skills/model-router/SKILL.md` | Agent 호출 가능한 셀프서비스 라우팅 스킬 |
| `scripts/lib/model-router.mjs` | 라우터 로직: 매칭, 폴백, CLI 빌드, 통계 |

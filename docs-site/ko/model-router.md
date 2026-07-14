---
title: 모델 라우터
description: 각 작업에 맞는 AI 모델을 자동으로 선택 - 직접 생각할 필요가 없습니다.
---

# 모델 라우터

> **Quick Answer:** Model Router는 작업 유형, routing profile, 능력 레지스트리, fallback 규칙을 바탕으로 모델을 선택합니다. 선택 이유가 필요하면 `--explain`을 사용하고, 비용·지연·능력 요구가 다르면 profile이나 명시적 override를 사용하세요.

## explain 가능한 라우트부터 시작하기

처음에는 explain 옵션이 있는 라우트를 실행하세요. 선택된 모델과 신호를 확인할 수 있어 결정을 검토할 수 있습니다.

**다른 AI 모델은 서로 다른 것에 능숙합니다.** 모델 라우터는 각 작업을 가장 잘 하는 모델에 자동으로 보냅니다.

프론트엔드 작업? Kimi K2.6 사용. 보안 검토? Claude Opus 사용. 브라우저 자동화? GPT-5.5 사용. 라우터가 작업 설명에서 판단하므로 이것들을 기억할 필요가 없습니다.

## 심플 버전

```bash
# 작업을 최적의 모델로 라우팅
node scripts/aios.mjs model-router route \
  --task "아름다운 랜딩 페이지 컴포넌트 구축" \
  --explain

# 결과: frontend → kimi-k2.6（「랜딩 페이지」「컴포넌트」「아름다운」 감지)
```

이것이 전부입니다. 라우터는 작업을 읽고, 신호를 감지하고, 최적의 모델을 선택합니다.

## 왜 중요한가

모델 라우터가 없으면 다음이 필요합니다:

1. 각 작업 유형에 가장 적합한 모델을 알아야 함
2. `codex`, `claude`, `gemini` 명령 사이를 수동으로 전환
3. 각 CLI 의 올바른 모델 플래그를 기억

모델 라우터가 있으면 작업을 설명하면 나머지를 처리합니다.

## 동작 원리

```
작업 설명
    ↓
신호 감지（「browser」「security」「frontend」 등의 키워드）
    ↓
작업 유형 분류（browser-automation, code-review 등）
    ↓
모델 선택（라우팅 프로필 기반）
    ↓
CLI 명령 생성（codex/claude/gemini 의 올바른 플래그）
    ↓
실행 + 결과 기록
```

## 모델 능력 레지스트리

| 모델 | 프로토콜 | 흥점 | 비용 |
|------|----------|------|------|
| **Claude Opus 4.7** | claude | 코드 리뷰, 아키텍처 설계, 보안 감사 | 가장 높음 |
| **Claude Sonnet 4.6** | claude | 일상 개발, RAG, 빠른 프로토타이핑 | 중간 |
| **GPT-5.5** | codex | 올라운더: 자동화, 추론, 코드 실행 | 가장 높음 |
| **DeepSeek-V4-Pro** | claude | 알고리즘 구현, 핵심 로직, 배치 처리 | 가장 낮음 |
| **GLM-5.1** | claude | 수학 추론, 자율 루프, 시스템 플래닝 | 낮음 |
| **Kimi K2.6** | claude | 멀티 에이전트 오케스트레이션, 프론트엔드 UI, 장기 실행 | 낮음 |
| **MiniMax-M2.7** | claude | 자체 복구, 프로덕션 장애 복구 | 낮음 |
| **Gemini-3-Pro** | gemini | 멀티모달 분석, 긴 문서 연구, 1M 컨텍스트 | 중간 |

## CLI 프로토콜

| 프로토콜 | CLI | 사용자 |
|---------|-----|--------|
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | 기타 모든 모델 |

Codex live worker는 `--dangerously-bypass-approvals-and-sandbox`（이전 `--yolo` 에 해당）를 기본으로 부여하여 백그라운드 subagent가 approval/sandbox prompt에서 기다리는 것을 방지합니다. 수동 디버깅 시에만 `AIOS_SUBAGENT_CODEX_UNATTENDED=0`으로 비활성화하세요.

## 라우팅 규칙

| 작업 유형 | 우선 모델 | 폴백 체인 |
|-----------|----------|-----------|
| 코드 리뷰 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 보안 감사 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 아키텍처 설계 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 구현 | DeepSeek-V4 | GPT-5.5 → Claude Sonnet |
| 브라우저 자동화 | GPT-5.5 | Kimi K2.6 → Claude Sonnet |
| 리서치/연구 | Gemini-3-Pro | GPT-5.5 → Kimi K2.6 |
| 플래닝 | GLM-5.1 | GPT-5.5 → Claude Opus |
| 테스트 | Claude Sonnet | GPT-5.5 → DeepSeek-V4 |
| 문서 | Claude Sonnet | GPT-5.5 → Kimi K2.6 |
| 프론트엔드/UI | Kimi K2.6 | GPT-5.5 → Claude Sonnet |
| 장애 복구 | MiniMax-M2.7 | GLM-5.1 → GPT-5.5 |
| 범용 | GPT-5.5 | Claude Sonnet → DeepSeek-V4 |

## 라우팅 프로필

라우팅의 적극성을 프로필로 선택:

| 프로필 | 사용 시점 | 동작 |
|-------|----------|------|
| `balanced`（기본값） | 대부분의 작업 | 강력한 신호가 모델을 업그레이드；일반 코딩은 저렴하게 유지 |
| `premium` | 위험하거나 불분명한 작업 | Opus 나 GPT-5.5 같은 비싼 모델을 더 기꺼이 사용 |
| `budget` | 비용 민감한 작업 | 작업이 정말 강한 모델이 필요하지 않는 한 저렴한 모델을 우선 |

```bash
# 명령마다 사용
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# 또는 세션용으로 설정
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 빠른 시작

### 모든 모델 보기

```bash
node scripts/aios.mjs model-router list
```

### 설명으로 작업 라우팅

```bash
node scripts/aios.mjs model-router route \
  --task "아름다운 랜딩 페이지 컴포넌트 구축" \
  --profile balanced \
  --explain
```

### 특정 작업 유형 강제

```bash
node scripts/aios.mjs model-router route \
  --task "데이터베이스 연결 리팩토링" \
  --task-type implementation
```

### 디스패치 기록 보기

```bash
node scripts/aios.mjs model-router stats
```

## 왜 이 모델이 선택되었는가

어떤 route 명령에나 `--explain` 을 추가하여 이유를 확인:

```json
{
  "resolvedType": "browser-automation",
  "modelId": "gpt-5.5",
  "confidence": 0.86,
  "matchedSignals": [
    { "taskType": "browser-automation", "signal": "browser", "weight": 8 }
  ],
  "why": ["Detected browser-automation signals: browser, upload"]
}
```

- **높은 신뢰도** = 하나의 작업 유형이 명확하게 일치
- **여러 recommendedPhases** = 작업이 복합적；더 나은 라우팅을 위해 분할
- **matchedSignals** 는 정확히 어떤 키워드가 라우팅을 트리거했는지 표시

## 환경 변수로 오버라이드

특정 모델을 강제하고 싶다면:

```bash
# 롤별
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus

# 작업 유형별
export AIOS_MODEL_BROWSER_AUTOMATION=gpt-5.5
export AIOS_MODEL_CODE_REVIEW=claude-opus

# 라우팅 완전 비활성화（고정 모델 사용）
export AIOS_MODEL_ROUTER=0
```

## Agent 통합

### 작업 라우팅에 의한 유도

모델 라우터는 AIOS Task Router를介して Agent 컨텍스트에 주입됩니다. `ctx-agent` 下で実行されるすべての Agent は自動的にモデルディスパッチの guidance を取得します。サブタスクがディスパッチされるとき、Agent は `model-router` skill を呼び出して最適なモデルを決定できます。

### 오케스트레이터에 의한

Agent 롤 카드（`.claude/agents/*.md`）에는 `preferredModel` 필드가 포함되며, 오케스트레이터는 디스패치時に 자동으로解決합니다:

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

모델 해결 우선순위: **환경 변수** > **preferredModel** > **model**（폴백）。

## 인식 피드백 루프

각 모델 디스패치는 ContextDB의 `model.dispatch` 이벤트として記録됩니다。知覚 시스템은 작업 유형별로モデルの成功率을計算할 수 있습니다。미래のルーティング決定は：**能力マッチング × 歴史的成功率 × コスト**を総合的に考慮します。

## 설정 파일

| 파일 | 용도 |
|------|------|
| `scripts/lib/specs/model-registry.json` | 모델 능력, 라우팅 규칙, CLI 프로토콜 설정 |
| `scripts/lib/specs/orchestrator-agents.json` | Agent 롤→preferredModel 매핑 |
| `.claude/skills/model-router/SKILL.md` | Agent가 호출 가능한 셀프서비스 라우팅 스킬 |
| `scripts/lib/model-router.mjs` | 라우터 로직: 매칭, 폴백, CLI 빌드, 통계 |

## 일반적인 질문

### 모두 DeepSeek 로 라우팅되는 이유는?

`balanced` 프로필에서 일반 구현 작업은 DeepSeek 으로 갑니다（저렴하고 좋으므로）。더 강한 모델을 원하는 작업에는 `--profile premium` 을 사용하세요.

### 작업에 여러 부분이 있고 하나의 모델만 얻었습니다

현재 복합 작업은 하나의 모델을 얻습니다. explain 출력의 `recommendedPhases` 를 확인하세요 — 여러 유형이 표시되면 작업을 개별 작업으로 분할하세요.

### Agent Team でも使用できますか？

네. Agent Team 은 기본적으로 모델 라우터를 사용합니다 — 팀의 각 페이즈가 자동으로 최적의 모델로 라우팅됩니다.

## 다음 단계

- [Agent Team](team-ops.md) — 자동 라우팅이 있는 멀티 에이전트 협업
- [ContextDB](contextdb.md) — 프로젝트 메모리
- [Solo Harness](solo-harness.md) — 장기 실행 싱글 에이전트 작업

## FAQ

### 모델을 고르기 전에 모델을 호출하나요?

아닙니다. 작업 메타데이터와 능력 설정에서 client/model 경로를 고른 뒤 선택된 클라이언트가 실행합니다.

### 추천을 덮어쓸 수 있나요?

가능합니다. 비용, 지연, 능력 요구에 맞춰 profile이나 role/task override를 지정하세요.

## 공식 문서

[Agent Team](team-ops.md), [워크플로 정책](workflow-policy.md), [ContextDB](contextdb.md)에서 실행 계약을 확인할 수 있습니다.

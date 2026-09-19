---
title: 모델 라우터
description: "모델 라우터는 작업 유형, 라우팅 프로파일, capability registry, 폴백 규칙에 따라 적절한 AI 모델을 자동으로 고릅니다. 각 모델의 장단점이나 사용 한도를 외울 필요가 없습니다. 왜 그렇게 골랐는지는 --explain으로 확인하고 필요하면 직접 덮어쓸 수 있습니다."
---

# 모델 라우터

> **Quick Answer:** Model Router는 작업 유형, routing profile, 능력 레지스트리, 설정된 fallback 규칙을 바탕으로 모델을 선택합니다. 선택 이유가 필요하면 `--explain`을 사용하고, 비용·지연·능력의 절충이 맞지 않으면 profile이나 명시적 override를 사용하세요.

## 먼저 explain 가능한 라우트부터

`--explain`를 붙여 라우팅하고, 선택된 모델과 판단 근거를 반드시 검토하세요.

**AI 모델마다 잘하는 분야가 다릅니다.** 모델 라우터는 작업 유형과 capability 레지스트리를 대조해 가장 잘하는 모델로 보냅니다. 프론트엔드는 **Claude Sonnet 5**, 보안 감사는 **Claude Opus 5**, 브라우저 자동화는 **GPT-6-Astra**. 이 대응은 레지스트리가 기억하므로 외울 필요가 없습니다.

## 심플 버전

```bash
# 작업 유형을 명시 선언해서 최적 모델로 라우팅
node scripts/aios.mjs model-router route \
  --task "아름다운 랜딩 페이지 컴포넌트 구축" \
  --task-type frontend \
  --explain

# 결과: frontend → claude-sonnet-5 (클라이언트 claude / --model)
```

이게 전부입니다. 라우터는 레지스트리를 대조하고, 클라이언트 계약으로 좁히고, CLI 인수를 만듭니다.

작업 텍스트에서 키워드를 추론해 작업 유형을 **결정하지 않습니다**. `signals.mjs`의 North Star 제약대로 라우팅 입력(`taskType` / `intent`)은 호출자가 명시 선언합니다. 선언이 없으면 `general`으로 떨어지고 `--explain`의 `why`에 "Explicit task type selected: ..." 또는 "No explicit task type or intent..."가 기록됩니다. 상류(solo / phase job / team role / CLI)에서 어떻게 선언하느냐가 실제 설계 포인트입니다.

## 왜 중요한가

모델 라우터가 없다면 다음이 필요합니다:

1. 각 작업 유형에 가장 적합한 모델을 파악
2. `codex`, `claude`, `gemini` 명령 수동 전환
3. 각 CLI의 올바른 모델 플래그 기억

모델 라우터가 있으면 작업만 설명하면 나머지는 처리됩니다.

## 동작 원리

```
명시 선언（--task-type / phase role / team role / 환경 변수）
    ↓
작업 유형 해석（선언 없으면 general）
    ↓
routing profile 조정（balanced / premium / budget）+ role override
    ↓
레지스트리 대조（primary + fallback 체인）
    ↓
클라이언트 계약（모델 프로토콜 ∩ 실행 클라이언트）
    ↓
채널 가용성 필터（활성화 시, 런타임 파일 출처）
    ↓
CLI 명령 생성（codex / claude / gemini 올바른 플래그）
    ↓
실행 + 결과를 model.dispatch로 기록
```

## CLI 프로토콜

프로토콜 어휘는 4 종. 모델이 선언한 프로토콜과 실행 클라이언트가 말할 수 있는 프로토콜이 교차해야 해당 경로를 실제로 쓸 수 있습니다 (아래 「클라이언트 모델 라우팅 계약」 참조):

| 프로토콜 | 릴레이 엔드포인트 | 실행 가능 클라이언트 |
|---|---|---|
| `openai-response` | `https://coding.rexai.top/openai/v1/responses` | codex, opencode |
| `openai-chat` | `https://coding.rexai.top/openai/v1/chat/completions` | hermes, opencode, pi |
| `claude` | `https://coding.rexai.top/claude/v1/messages` | claude, hermes, opencode, pi |
| `gemini` | `https://coding.rexai.top/gemini/v1beta/models/<model>:generateContent` | opencode |

Codex live worker는 `--dangerously-bypass-approvals-and-sandbox`（구 `--yolo`에 해당）를 기본 부여해 백그라운드 subagent가 approval/sandbox 프롬프트에서 대기하는 것을 방지합니다. 수동 디버그 때만 `AIOS_SUBAGENT_CODEX_UNATTENDED=0`으로 비활성화하세요.

## 모델 능력 레지스트리

레지스트리는 라우팅 규칙이 쓰는 모델과 구조화된 능력을 담습니다. 전체 목록은 `node scripts/aios.mjs model-router`에서 확인하세요.

| 모델 | 사용 가능한 프로토콜 | 잘하는 분야 | 비용 | 컨텍스트 |
|---|---|---|---|---|
| **Claude Opus 5** | `claude` | 코드 리뷰, 아키텍처 설계, 보안 감사 | 가장 높음 | 200K |
| **Claude Opus 4.8** | `claude` | 코드 리뷰, 보안 감사, 장문 작성 | 높음 | 200K |
| **GPT-6-Astra** | `openai-response` | 만능, 범용 추론, 브라우저 자동화 | 가장 높음 | 1M |
| **Claude Sonnet 4.6** | `claude` | 일상 개발, 빠른 프로토타이핑, RAG | 보통 | 200K |
| **GLM-5.2** | `claude`, `openai-chat` | 자율 루프, 장시간 플래닝, 수학 추론 | 낮음 | 200K |
| **Claude Opus 4.7** | `claude` | 코드 리뷰, 아키텍처 설계, 보안 감사 | 가장 높음 | 200K |
| **DeepSeek-V4-Pro** | `claude` | 알고리즘 구현, 코어 로직, 장 로그 분석 | 가장 낮음 | 1M |
| **Claude Sonnet 5** | `claude` | 일상 개발, 빠른 프로토타이핑, 프론트엔드 UI | 보통 | 200K |
| **DeepSeek-V4-Flash** | `openai-chat`, `claude` | 알고리즘 구현, 배치 처리, 장 로그 분석 | 가장 낮음 | 1M |
| **GPT-5.5** | `openai-response` | 범용 추론, 브라우저 자동화, 데스크톱 자동화 | 가장 높음 | 1M |
| **Gemini-3.8-Flash** | `gemini` | 멀티모달 분석, 장문 문서 연구, 영상 분석 | 보통 | 1M |
| **GPT-5.6-Sol** | `openai-response` | 범용 추론, 장시간 실행, 코드 실행 | 높음 | 1M |
| **Claude Haiku 4.5** | `claude` | 분류, 요약, 배치 처리 | 낮음 | 200K |
| **GLM-5.3-Flash** | `openai-chat` | 분류, 문서 작성, 테스트 실행 | 가장 낮음 | 200K |
| **Kimi K2.6** | `claude` | 멀티 에이전트 오케스트레이션, 장시간 실행, 프론트엔드 UI | 낮음 | 200K |
| **MiniMax-M2.7** | `claude` | 자가 복구, 운영 복구, 지속 최적화 | 낮음 | 200K |

## 라우팅 규칙

| 작업 유형 | 우선 모델 | 폴백 체인 |
|---|---|---|
| `code-review` | **Claude Opus 5** | Claude Opus 4.8 → GPT-6-Astra → Claude Sonnet 4.6 |
| `security-review` | **Claude Opus 5** | Claude Opus 4.8 → GPT-6-Astra → GLM-5.2 |
| `architecture` | **Claude Opus 5** | GPT-6-Astra → GLM-5.2 → Claude Opus 4.7 |
| `implementation` | **DeepSeek-V4-Pro** | GPT-6-Astra → Claude Sonnet 5 → DeepSeek-V4-Flash |
| `browser-automation` | **GPT-6-Astra** | GPT-5.5 → Claude Sonnet 5 |
| `research` | **Gemini-3.8-Flash** | DeepSeek-V4-Pro → Claude Sonnet 5 → GPT-5.6-Sol |
| `planning` | **GLM-5.2** | GPT-6-Astra → Claude Opus 5 → Claude Opus 4.7 |
| `testing` | **Claude Haiku 4.5** | Claude Sonnet 5 → GLM-5.3-Flash → DeepSeek-V4-Flash |
| `docs` | **Claude Sonnet 5** | GLM-5.3-Flash → GPT-5.5 → Kimi K2.6 |
| `frontend` | **Claude Sonnet 5** | GPT-5.6-Sol → Kimi K2.6 → GPT-5.5 |
| `self-healing` | **GLM-5.2** | GPT-6-Astra → MiniMax-M2.7 → DeepSeek-V4-Pro |
| `general` | **GPT-6-Astra** | Claude Sonnet 5 → GLM-5.2 → DeepSeek-V4-Pro |

## 라우팅 프로파일

모델 선택의 적극성을 제어합니다:

| 프로파일 | 사용 시점 | 동작 |
|---|---|---|
| `balanced`（기본） | 대부분의 작업 | 능력이 강하게 겹칠 때만 상위 모델로 올리고, 일반 코딩은 저렴하게 유지 |
| `premium` | 위험하거나 불분명한 작업 | Opus 나 GPT-6-Astra 같은 상위 모델을 더 적극 사용 |
| `budget` | 비용 중시 작업 | 작업이 정말 상위 모델을 필요로 하는 경우를 제외하고 최저가 모델 우선 |

```bash
# 명령마다 지정
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# 또는 세션에 설정
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 빠른 시작

### 레지스트리와 규칙 보기

```bash
node scripts/aios.mjs model-router
```

### 설명과 함께 작업 라우팅

```bash
node scripts/aios.mjs model-router route \
  --task "아름다운 랜딩 페이지 컴포넌트 구축" \
  --task-type frontend \
  --profile balanced \
  --explain
```

### 작업 유형 명시 선언

```bash
node scripts/aios.mjs model-router route \
  --task "데이터베이스 연결 리팩터링" \
  --task-type implementation
```

### 디스패치 이력 보기

```bash
node scripts/aios.mjs model-router stats
```

### 채널 가용성 상태 보기

```bash
node scripts/aios.mjs model-router availability
```

## 왜 이 모델이 선택되었는가

아무 route 명령이나 `--explain`를 붙여 근거를 확인하세요:

```json
{
  "resolvedType": "implementation",
  "modelId": "deepseek-v4",
  "model": "DeepSeek-V4-Pro",
  "clientId": "claude-code",
  "reason": "primary match for taskType=\"implementation\"",
  "profile": "premium",
  "confidence": 1,
  "matchedSignals": [],
  "why": ["Explicit task type selected: implementation"],
  "contractMode": "",
  "modelProtocols": ["claude"],
  "requestedModelId": "deepseek-v4",
  "skippedForCapability": []
}
```

- **`resolvedType`** = 선언에서 해석한 작업 유형. 키워드 추론의 증거가 아님
- **`matchedSignals: []`** = 라우터는 자유 텍스트에서 작업 유형을 추측하지 않음（`signals.mjs`의 North Star 제약）
- **`why`** = 명시 선언인지, 선언이 없는 결정적 `general` 폴백인지 설명
- **`requestedModelId` / `skippedForCapability` / `contractMode`** = 클라이언트 계약으로 좁힌 흔적

## 모델 선택 오버라이드

특정 모델을 강제하려면:

```bash
# 역할별（planner / implementer / reviewer / security-reviewer）
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTER=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus

# 프로파일별
export AIOS_MODEL_ROUTER_PROFILE=budget

# 라우팅 자체를 비활성화（각 클라이언트 기본 모델 사용）
export AIOS_MODEL_ROUTER=0
```

오버라이드를 지정하면 라우터는 모델을 통과시키지 않고, 그 모델을 말할 수 있는 클라이언트로 전환합니다. 클라이언트에 맞춰 모델을 바꾸는 것은 자동 라우팅만 가능합니다.

## 설정 파일

| 파일 | 용도 |
|---|---|
| `scripts/lib/specs/model-registry.json` | 모델 능력, 라우팅 규칙, CLI 프로토콜 구성 |
| `scripts/lib/specs/orchestrator-agents.json` | Agent 역할 → preferredModel 매핑（schema v2） |
| `.claude/skills/model-router/SKILL.md` | Agent 셀프 서비스 라우팅 skill |
| `.claude/agents/*.md` | preferredModel frontmatter가 들어간 Agent 역할 카드 |
| `scripts/lib/model-router.mjs` | 라우터 로직: 대조, fallback, CLI 빌드, 통계 |

## Agent 통합

### 작업 라우팅을 통한 유도

모델 라우터는 AIOS Task Router를 통해 Agent 컨텍스트에 주입됩니다. `ctx-agent`에서 실행되는 Agent는 모델 디스패치 지침을 자동으로 얻습니다. 서브태스크를 디스패치할 때 Agent는 `model-router` skill을 호출해 최적 모델을 결정할 수 있습니다.

### 오케스트레이터에 의한 해석

Agent 역할 카드（`.claude/agents/*.md`）의 `preferredModel`을 오케스트레이터가 디스패치 시에 해석합니다:

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

모델 해석 우선순위: **환경 변수** > **preferredModel** > **model**（폴백）.

## 인식 피드백 루프

모든 디스패치는 ContextDB의 `model.dispatch` 이벤트로 기록되고, 작업 유형별 성공 확률을 집계합니다. 향후 판단은 **능력 적합 × 역사 성공률 × 비용**을 함께 반영합니다.

## 클라이언트 모델 라우팅 계약

실제로 기동되는 클라이언트가 그 프로토콜을 말할 수 없으면 라우팅에 의미가 없습니다. AIOS는 추측하지 않고 클라이언트 등록표（`scripts/lib/clients/core/definitions.mjs`）에서 읽습니다:

| 클라이언트 | `modelRouting` | 말할 수 있는 프로토콜 | 모델 인수 |
|---|---|---|---|
| codex | `relay` | `openai-response` | `-m` |
| claude | `relay` | `claude` | `--model` |
| gemini | `own` | _미공개_ | `-m` |
| opencode | `relay` | `openai-chat`, `openai-response`, `claude`, `gemini` | `-m` |
| hermes | `relay` | `claude`, `openai-chat` | `--model` |
| grok | `own` | _미공개_ | `-m` |
| workbuddy | `own` | _미공개_ | `--model` |
| pi | `relay` | `openai-chat`, `claude` | `--model` |
| zcode | `own` | _미공개_ | `—` |
| qoder | `own` | _미공개_ | `—` |

- `relay`: 네이티브 프로토콜 게이트웨이형 CLI. `coding.rexai.top`으로 향하면 큐레이션된 모델을 모두 쓸 수 있습니다.
- `own`: 모델 인수를 전혀 넘기지 않고 클라이언트 자체 기본 모델을 씁니다. AIOS는 설정을 고치지 않습니다.
- `hermes`는 `openai-chat` 상류를 종단할 수 있지만 기동은 Anthropic 호환 채널만 쓰므로 `claude` + `openai-chat`을 선언합니다.
- `qoder`는 `own`이며 zcode·grok·workbuddy와 같은 상태입니다. 모델이 계정에 묶여 대화형 `/model`로 고르고, 검증된 headless `--model` 플래그가 없어서 AIOS는 현재 Qoder로 모델을 중계하지 않습니다.

프로토콜과 엔드포인트 대응은 `scripts/lib/model-router/protocols.mjs`: `openai-chat -> /openai/v1/chat/completions`, `openai-response -> /openai/v1/responses`, `claude -> /claude/v1/messages`, `gemini -> /gemini/v1beta/models/<model>:generateContent`.

여기서 두 규칙이 나옵니다:

- **명시 선언 우선.** `-m`, `AIOS_MODEL_*`, 작업 모델이 설정되면 클라이언트가 모델을 따라갑니다（provider 클라이언트 + 그 `--model` 채널）. 워커 클라이언트에 맞춰 모델을 바꾸는 것은 자동 라우팅만 허용됩니다.
- **자동 라우팅은 클라이언트를 바꾸지 않는다.** team role, subagent, phase job은 작업이 지정한 클라이언트로 기동합니다. 그 클라이언트가 최적 모델을 말할 수 없으면 쓸 수 있는 최강 모델까지 폴백 체인을 내려갑니다.

판단은 모두 라우트 결과에 남습니다: `requestedModelId`（원래 요구）, `skippedForCapability`（후보를 건너뛴 이유）, `modelProtocols`, `contractMode`.

## 채널 가용성（런타임 계층）

레지스트리가 모델의 잘하는 분야를 나타낸다면, 또 다른 상태 기계는 중계소가 **지금** 무엇을 제공할 수 있는지 기록합니다. 학습 출처는 실제 디스패치 결과뿐입니다:

| 현상 | 기록 내용 |
|---|---|
| `model_not_found`, `no available channel`, 게이트웨이 응답 절단, 프로브 HTTP 404 | 채널 `down`（404는 즉시 죽음 판정） |
| 연결·타임아웃·reset, 5xx, 첫 바이트 이전 단절 | `network` 실패 |
| 실제 모델과 다른 id가 반환 | `degraded`（채널이 불안정） |
| 첫 바이트가 지연 예산 초과 | `degraded` |
| 연속 2 회 실패 | `down` |
| 성공 | 복구 경로를 통해 `ok`로 복귀 |

Agent 쪽 실패（`tool`, `provider-output`, `timeout-after-output`）는 채널 증거로 기록하지 **않습니다**. worker가 도구를 잘못 썼다고 모델을 식히지 않습니다.

확인: `node scripts/aios.mjs model-router availability`. 라우팅은 기본으로 이 캐시를 읽지 않습니다（오프라인 결정성 유지）. `AIOS_MODEL_AVAILABILITY=1`일 때만 사용 불가 채널을 제외하고, 적용 결과는 `orchestrate plan preview`와 phase dispatch 이벤트의 `channelDown` / `degradedChannel`에 나타납니다. `down`은 `cooldownMs`（기본 300 초）후 자동 복귀, `ok`는 `ttlMs`（기본 600 초）초과 시 만료. 캐시는 `memory/specs/model-availability.json`（`AIOS_MODEL_AVAILABILITY_PATH`로 덮어쓰기, `AIOS_MODEL_AVAILABILITY_FEEDBACK=0`으로 쓰기 중단）.

## 다음 단계

- [Agent Team](team-ops.md) — 자동 라우팅이 있는 멀티 에이전트 협업
- [ContextDB](contextdb.md) — 프로젝트 메모리
- [Solo Harness](solo-harness.md) — 장시간 실행 단일 에이전트 작업

## FAQ

### 모델을 고르기 전에 모델을 호출합니까?

아닙니다. 라우터는 작업 메타데이터와 설정된 능력 레지스트리로 client/model 경로를 고르고, 이후 선택된 클라이언트가 작업을 실행합니다.

### 추천 결과를 덮어쓸 수 있습니까?

가능합니다. 비용, 지연, 능력 요구에 따라 routing profile 이나 역할별 명시 override를 사용하세요.

### 왜 구현 작업은 늘 저렴한 모델로 갑니까?

`balanced`에서 `implementation`은 저렴한 DeepSeek-V4 로 결정됩니다. 상류가 더 강한 능력 합류를 보거나 `--profile premium`을 쓰면 상위 모델로 올라갑니다.

### 작업에 여러 부분이 있는데 모델 하나만 나옵니다

복합 작업은 현재 모델 하나입니다. explain 출력의 `recommendedPhases`를 확인하고, 여러 유형이면 개별 작업으로 나누세요.

### Agent Team에서도 쓸 수 있습니까?

됩니다. Agent Team은 기본으로 모델 라우터를 사용하고 팀의 각 phase가 자동으로 최적 모델로 라우팅됩니다.

## 공식 문서

완전한 실행 계약을 보려면 [Agent Team](team-ops.md), [워크플로 전략](workflow-policy.md), [ContextDB](contextdb.md)를 함께 읽으세요.

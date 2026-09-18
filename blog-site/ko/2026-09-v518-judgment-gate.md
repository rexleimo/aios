---
title: "v5.18.0: AIOS에 TypeSafe Jev 도입 — 기본값은 꺼짐, 의도된 선택"
description: "TYPESAFE_API_KEY를 네 단계로 설정하고, 문서 MCP를 설치해도 판단이 절대 발생하지 않는 이유와 새 aios judgment 게이트가 명시적으로 켜기 전까지 닫혀 있는 이유를 설명합니다."
date: 2026-09-18
tags: ["AIOS", "TypeSafe", "Jev", "System One", "MCP", "공급망", "release", "v5.18.0"]
---

# v5.18.0: AIOS에 TypeSafe Jev 도입 — 기본값은 꺼짐, 의도된 선택

AIOS v5.18.0은 opt-in **판단 게이트**를 추가합니다. 워크플로가 TypeSafe의 System One 모델(Jev)에게 좁고 타입이 있는 질문 하나를 던지고, 보정된 답을 돌려받는 구조입니다. 같은 릴리스에서 Gemini CLI 설정 전체를 조용히 망가뜨릴 수 있던 결함을 고쳤고, 내부 키가 클라이언트 스킬 트리로 새던 frontmatter 문제도 막았습니다.

이 글은 정직한 버전입니다. "이전 릴리스는 보이는 것조차 실제로는 할 수 없었다"는 사실을 알게 된 이야기도 포함합니다.

## 한 줄 답변

| 질문 | 답변 |
| --- | --- |
| 자격 증명은 어떻게 설정하나? | 클라이언트가 실제로 실행되는 환경에 `TYPESAFE_API_KEY`를 설정하고 **클라이언트를 재시작**합니다. 아래 네 개의 명령. |
| TypeSafe 통합을 설치하면 Jev가 답하나? | 아닙니다. 설치되는 것은 **문서** MCP 서버입니다. 문서를 검색할 뿐, 판단을 생성하지 못합니다. |
| 설치하면 판단 게이트가 켜지나? | 아닙니다. `aios judgment enable typesafe`를 실행하기 전까지 꺼져 있습니다. |
| 자격 증명이나 플래그가 없으면? | 아무것도 전송되지 않습니다. "답을 알고 있다고 가정하는" 폴백도 없습니다. |

## 처음에 잘못 알고 있던 것

이전 릴리스에서 `aios integration add typesafe`를 출시했습니다. 커밋으로 스킬을 고정하고 sha256을 검증하며 모든 클라이언트에 `typesafe-docs`를 등록합니다. doctor는 `verified`를 보고했습니다. 완성된 것처럼 보였습니다.

그래서 설치된 부품이 실제로 무엇을 할 수 있는지 측정했습니다:

| 부품 | 할 수 있는 것 |
| --- | --- |
| `typesafe-docs` MCP | 도구 4개: `search_type_safe_ai`, `query_docs_filesystem_type_safe_ai`, `submit_feedback`, `read_typesafe`. **전부 문서 검색이며 추론 도구는 없습니다.** |
| 함께 설치된 `typesafe-ai` 스킬 | TypeSafe 공식 스킬입니다. `grep -c 'TYPESAFE_API_KEY\|POST\|curl\|systemone'` → **0**. 개념을 설명하고 온라인 문서를 가리킵니다. |
| AIOS 런타임 | 호출 지점 0개. |

즉 이전 릴리스는 Jev의 **지도**를 설치했을 뿐, Jev 자체는 한 번도 건드리지 않았습니다. 설치기의 결함이 아닙니다. 계획 문서가 "자격 증명을 사용하는 TypeSafe API 호출"을 명시적으로 범위 밖으로 두었습니다. 서사의 공백이며, 이 릴리스가 그것을 채웁니다.

교훈은 일반화됩니다: **"통합이 설치됨"과 "그 기능을 쓸 수 있음"은 다른 주장입니다.** doctor에 값어치가 있는 것은 후자뿐입니다.

## 자격 증명 설정

`TYPESAFE_API_KEY`가 관여하는 유일한 자격 증명입니다. AIOS는 **존재 여부만** 확인하며 값을 읽거나 출력하거나 저장하지 않습니다. 설정은 코딩 클라이언트가 실제로 실행되는 환경에 직접 해 두어야 합니다.

가장 흔한 실패 원인은 범위입니다. 어느 터미널에서 `export`한 변수나, 다른 계정의 *User* 범위에 쓴 변수는 이미 실행 중인 클라이언트에게 보이지 않습니다.

**Windows —— 내 계정에 영구 적용:**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'User')
```

**Windows —— 모든 계정(관리자 터미널 필요):**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'Machine')
```

**macOS / Linux:**

```bash
export TYPESAFE_API_KEY="<your-key>"                                # 현재 셸에서만
echo 'export TYPESAFE_API_KEY="<your-key>"' >> ~/.bashrc            # 영구 적용
```

그다음 **코딩 클라이언트를 재시작하세요**. 환경 변수는 프로세스가 시작될 때 한 번만 읽힙니다. 이미 열려 있는 클라이언트는 그 뒤에 설정한 값을 절대 보지 못합니다. 이것이 "통합은 제대로 설치됐는데 자격 증명이 없다고 나오는" 가장 큰 이유입니다.

클라이언트가 무엇을 보게 되는지 확인합니다:

```bash
aios integration doctor typesafe
```

자격 증명 행은 `present` 또는 `unset`만 보고하며 값을 표시하지 않습니다.

## 게이트 켜기

```bash
aios judgment status                    # 사용자가 켜기 전까지 disabled
aios judgment enable typesafe           # ~/.aios/judgment/config.json 기록
aios judgment enable typesafe --probe   # ……그리고 과금되는 호출을 정확히 한 번 전송
```

단 1바이트라도 기계를 떠나기 전에 세 조건이 동시에 성립해야 합니다:

| # | 조건 | 기본값 |
| --- | --- | --- |
| 1 | 프로세스 환경에 `TYPESAFE_API_KEY` 존재 | 미설정 |
| 2 | `~/.aios/judgment/config.json`의 `enabled: true` | `false` |
| 3 | 세션 호출 수와 입력 길이 예산이 남아 있음 | 20회, 20000자 |

하나라도 성립하지 않으면 호출 면은 존재하지 않습니다. 요청이 나가지 않으며, "답이 긍정이라고 가정하는" 폴백 경로도 없습니다. `--probe`는 `ask`를 직접 쓰지 않고 AIOS가 비용을 지출하는 유일한 경로이며, 사용자가 직접 입력했을 때만 동작합니다.

## 판단은 제안이며 사실이 아닙니다

가장 중요한 설계 결정입니다. Jev에게는 아무것도 쓸 권한이 없습니다. 모든 결과는 모델, `x-typesafe-request-id`, 토큰 사용량, 신뢰도를 함께 가지며, 런타임이 허용받은 일은 그것을 설정된 임계값과 비교하는 것뿐입니다.

| 판정 | 조건 | 의미 |
| --- | --- | --- |
| `act` | 신뢰도가 `actFloor` 이상 | 묻지 않고 진행 |
| `confirm` | 두 임계값 사이 | 먼저 사람에게 확인 |
| `abort` | `confirmFloor` 미만 | 행동하지 않음 |

두 가지 규칙이 이것이 권위가 되는 것을 막습니다:

- **위험은 임계값을 높이는 방향으로만 작용합니다.** 파괴적 변경은 읽기 전용 동작보다 더 높은 신뢰도를 요구합니다. 판단 때문에 AIOS가 게이트가 원래 거부할 행동을 하게 되는 경로는 존재하지 않습니다.
- **`Noul`은 설계상 신뢰도를 가지지 않습니다.** API가 반환하지 않으므로, 게이트는 주어진 확률을 그대로 사용하고 신뢰도처럼 보이는 숫자를 만들어 내지 않습니다.

형태는 값보다 먼저 검증됩니다. `choice` 답변이 선언되지 않은 선택지를 반환하거나, 답변의 `type`이 보낸 질문과 일치하지 않으면 오류입니다. 강제로 변환되는 일은 없습니다.

## 같은 릴리스에서 고친 것

- **Gemini CLI 설정 복구.** AIOS는 `~/.gemini/settings.json`에 `startupTimeoutSec`(초)를 쓰고 있었습니다. Gemini는 MCP 서버 항목을 엄격 모드로 검증하며, 실제로 받아들이는 필드는 `timeout`(**밀리초**)입니다. 즉 잘못된 키 하나가 **설정 전체**를 조용히 무효화하고 Gemini는 시작을 거부했습니다. 명시적 필드 허용 목록을 가진 정규화기를 (기존 ZCode 경로를 따라) 추가하고, 이미 망가진 설정 두 개를 백업과 함께 그 자리에서 마이그레이션했습니다.
- **CRLF 파일의 frontmatter 누출.** `parseFrontmatter`는 `lines[0] !== '---'`로 frontmatter 존재를 판정했습니다. CRLF 파일에서는 그 줄이 `'---\r'`이라 판정에 실패하고, 파서는 파일을 그대로 반환했으며, AIOS의 내부 키(`clients`, `scopes`, `repoTargets`……)가 클라이언트 스킬 트리로 그대로 새어 나갔습니다. 문서가 절대 일어나지 않는다고 약속한 일입니다. 파서는 이제 진입 시점에 줄바꿈을 정규화하고 항상 LF를 출력합니다. AIOS 자체 해시 검증은 해시 계산 **전에** 줄바꿈을 정규화했기 때문에 계속 경고를 내지 않았습니다.
- **정직한 클라이언트 지원 표.** Gemini는 이제 검증된 `cli` transport입니다. ZCode는 `PATH`에 CLI가 없는 Electron 클라이언트로 밝혀졌습니다. AIOS는 stdio 서버를 `~/.zcode/cli/config.json`의 `mcp.servers`에 쓰고 ZCode는 거기서 읽지만, HTTP 항목에는 AIOS가 아직 쓰지 않는 `url` 필드가 필요하므로 그 부분은 수동 단계로 남습니다. 문서는 더 이상 반대로 암시하지 않습니다.
- **버전에 묶인 사이트 게이트 두 개.** `check:site-sync`는 모든 언어에 릴리스 블로그 글을 요구합니다. 이번 릴리스 전에는 실패하고 있었습니다.

## 증거

게이트는 mock이 아니라 실제 엔드포인트에 대해 종단 간 검증했습니다:

```text
POST https://api.typesafe.ai/v1/systemone
date: Fri, 18 Sep 2026 11:54:33 GMT
HTTP/1.1 200 OK
x-typesafe-request-id: req_01a0b45e4b9d76d6b5346020c5df7aa9
{"model":"jev-1.13.0",
 "answers":{"severity":{"type":"score","score":2.94,"confidence":0.94,
            "probabilities":{"0":0.0,"1":0.01,"2":0.05,"3":0.94}}},
 "usage":{"input_tokens":325,"output_tokens":17}}
```

`x-typesafe-request-id`는 서버가 발급하며, 응답에는 `istio-envoy` 업스트림 시간 헤더도 있습니다. 요청은 실제로 TypeSafe 게이트웨이를 통과했고 계량되었습니다.

비활성 경로도 검증했습니다. 설정도, 활성화 플래그도 없는 상태에서 전송 계층이 절대 호출되지 않음을 테스트 스위트가 단언합니다. 가장 중요하게 여기는 속성이므로 설명이 아니라 단언으로 두었습니다.

## 아직 답할 수 없는 부분

당사의 TypeSafe 콘솔은 이 자격 증명에 대해 **요청 0건**을 보여줍니다. 그런데도 모든 호출에 서버가 발급한 request-id가 있습니다. 조회할 수 있는 사용량 API는 없고(`/v1/me`, `/v1/account`, `/v1/usage` 모두 404), `Spend $0.00`은 아무것도 증명하지 못합니다. 입력 325 토큰은 $0.042/MTok 기준 $0.0000137이기 때문입니다.

가장 가능성 높은 설명은 이 키가 우리가 보고 있는 콘솔과 다른 조직에 속한다는 것입니다. 이것을 숨기지 않고 공개합니다. "대시보드는 0이라고 말한다"는 문제가 될 때까지 무시되기 쉬운 종류의 신호이기 때문입니다. 과금되는 벤더를 자신의 워크플로에 연결한다면, **호출마다 벤더 자체의 request id를 기록하세요**. 청구 이견에서 살아남는 유일한 증거입니다.

## 업그레이드

```bash
aios update
aios judgment status
```

업그레이드 후에도 게이트는 꺼져 있습니다. 그것이 핵심입니다.

## 더 읽기

전체 레퍼런스는 문서와 함께 영어, 중국어, 일본어, 한국어 네 언어로 제공됩니다:

- `docs-site/integrations.md` —— 자격 증명 설정, 클라이언트별 지원 현황, 판단 게이트 레퍼런스.
- `docs-site/workflow-policy.md` —— AIOS가 direct / guarded / planned를 어떻게 선택하는지.

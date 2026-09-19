---
title: "Jev + AIOS 퀵스타트: 키워드 없이 백그라운드 자동 판단 (JVM 오해 풀이)"
description: "TYPESAFE_API_KEY를 설정하고 aios integration add typesafe와 aios judgment enable typesafe를 실행한 뒤 평소대로 대화하면 Jev(jev-latest)가 백그라운드에서 판단합니다. 설치만으로 발화하지 않는 이유, aios_judge와 rex 스테이지 게이트, 예산, JVM/MVC 이름 혼동을 정리."
date: 2026-09-19
tags: ["AIOS", "TypeSafe", "Jev", "System One", "판단 게이트", "MCP", "퀵스타트", "JVM"]
---

# Jev + AIOS 퀵스타트: 키워드 없이 백그라운드 자동 판단

TypeSafe 통합을 설치했는데 아무 일도 없다면 정상입니다. 설치는 Jev를 아는 것이고, **켜기**를 해야 Jev가 답합니다. 4개 명령으로 첫 백그라운드 판단까지 갑니다.

## 한눈에 보기

| 질문 | 답변 |
| --- | --- |
| 설치했는데 Jev가 답하지 않는 이유는? | 통합이 넣는 것은 **문서** MCP이며 판단을 만들 수 없습니다. `aios judgment enable typesafe`를 실행하세요. |
| "JVM" 같은 키워드가 필요한가요? | 필요 없습니다. 켠 뒤에는 평소대로 대화만 하세요. 게이트가 백그라운드에서 발화합니다. |
| 사람들이 말하는 "JVM"/"JVM MVC"는? | **Jev**와 **MCP** 문서 서버를 함께 잘못 들은 것입니다. 모델은 `jev-latest`, 서버는 `typesafe-docs`입니다. |
| 비용은? | 판단 1회당 과금 1회. 기본값은 세션당 20회·입력 20000자 상한. |

## 0단계——두 절반을 구분하기

| 절반 | 내용 | Jev 호출 가능? |
| --- | --- | --- |
| `aios integration add typesafe` | 고정 버전 스킬(`65a39f3`, sha256 검증) + 9개 클라이언트의 `typesafe-docs` MCP | 불가. 문서 검색만. |
| `aios judgment enable typesafe` | `~/.aios/judgment/config.json`에 `enabled: true` 기록 | 가능——`TYPESAFE_API_KEY`가 있을 때만. |

## 1단계——통합 설치

```bash
aios integration add typesafe --dry-run   # 전체 클라이언트 변경 미리보기, 기록 없음
aios integration add typesafe             # 스킬 설치 + 문서 MCP 등록
aios integration doctor typesafe          # 해시·등록·자격 존재 여부 검증
```

## 2단계——자격 설정 후 클라이언트 재시작

`TYPESAFE_API_KEY`가 유일한 비밀값입니다. AIOS는 존재 여부만 봅니다. 값을 읽거나 출력하거나 저장하지 않습니다.

```bash
# macOS / Linux
export TYPESAFE_API_KEY="<your-key>"                              # 이 셸만
echo 'export TYPESAFE_API_KEY="<your-key>"' >> ~/.bashrc          # 영속화
```

```powershell
# Windows(현재 계정에 영속)
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'User')
```

그런 뒤 **코딩 클라이언트를 재시작**하세요. 환경 변수는 프로세스 시작 시 한 번만 읽힙니다. 이미 켜져 있는 클라이언트에는 나중에 설정한 값이 보이지 않습니다.

## 3단계——게이트 켜기

```bash
aios judgment status           # 기대값: disabled, credential present
aios judgment enable typesafe  # ~/.aios/judgment/config.json 기록
aios judgment status           # 기대값: ENABLED, model jev-latest
```

선택 정직 체크(과금 1회, 사용자가 명시했을 때만):

```bash
aios judgment enable typesafe --probe
```

## 4단계——평소대로 대화. Jev는 백그라운드에서 일함

키워드도 "JVM 써줘"도 필요 없습니다. 평소처럼 작업하세요:

- 위험한 변경을 요청. 실행 전 게이트가 심각도를 채점해 `strict-tdd`와 `tdd`를 고릅니다. 애매하면 먼저 묻습니다.
- 구현 한 바퀴 종료. rex 스테이지가 전진하기 전 게이트가 Jev에 `noul` 1문항만 묻습니다: 이 증거가 완료를 검증 가능하게 보여주는가? 기준 미달이면 사유와 함께 보류(hold)합니다.

수동으로 1회 시도(반환 모양 보기):

```bash
aios judgment ask --state "백업 없이 운영 sessions 테이블을 삭제했다." \
  --questions '{"severity":{"type":"score","instructions":"이 변경의 위험도는?","criteria":["무시 가능","일상적","위험","데이터 손실"]}}' \
  --risk destructive --json
```

모든 답은 **제안이지 사실이 아닙니다**: `model`·`x-typesafe-request-id`·토큰 `usage`·신뢰도를 달고 `act` / `confirm` / `abort`로 매핑됩니다. 파괴적 변경은 읽기 전용보다 높은 신뢰도를 요구합니다. 게이트의 말이 콘텐츠를 만들거나 기각을 뒤집을 수는 없습니다.

## 알아야 할 가드레일

- **기본값 꺼짐, fail closed.** 자격 없음·플래그 없음·설정 파손 모두 결과는 같습니다: `tools/list`에 도구 없음, 네트워크 호출 0, 다음 단계가 적힌 거부.
- **두 표면, 둘 다 좁히기만.** `aios_judge`는 켜져 있을 때만 등장. rex 스테이지 게이트의 답은 `advance` / `hold`뿐. 동작을 넓힐 수 없습니다.
- **지출은 감사 가능.** 매 호출마다 `requestId` + `usage` + 호출자를 기록.
- **벤더 장애 시 기본 보류**합니다. 사용자가 직접 연 게이트이기 때문입니다. 장애 때도 통과시키려면 `onJudgmentError`를 `"allow"`로.

## 문제 해결

| 증상 | 처방 |
| --- | --- |
| 설치했는데 발화하지 않음 | 켜기 전까지 정상: `aios judgment enable typesafe` |
| `credential ... (NOT SET)` | 클라이언트 실제 환경에 `TYPESAFE_API_KEY`를 설정하고 클라이언트 재시작 |
| `ask`가 `judgment-disabled` | 먼저 켜기. 종료 코드 3은 "미활성"이지 "고장"이 아님 |
| Agent가 "JVM 모델"이라고 함 | Jev(`jev-latest`) 이야기. 그대로 쓰면 됨 |

## 다음 단계

- [AIOS에서 TypeSafe Jev 쓰기](https://cli.rexai.top/ko/integrations/)——레퍼런스.
- [v5.19.0: 판단 게이트에 몸 주기](2026-09-v519-judgment-gate-surfaces.md)——꺼져 있을 때 도구가 목록에 없는 이유.
- [v5.18.0: 기본값 꺼짐, 의도적](2026-09-v518-judgment-gate.md)——fail closed 설계.

---
title: "v6.16.0: 신선한 컨텍스트는 더 이상 행운이 아니다 — AIOS가 측정하고, 선언하고, 주입하고, fork를 무해하게 만든다"
description: "v6.16.0은 'fresh context, not a fork'를 '프로세스를 띄울 때 우연히 성립하던 것'에서 측정되고, 선언되고, 주입되고, 테스트로 고정된 계약으로 바꾼다. AIOS가 띄우는 워커는 이미 구조적으로 새로웠다(1회성 prompt, RESERVED_FLAGS가 --resume을 차단). 그러나 호스트 자신의 Task/Agent 도구에는 제약도, 로컬 근거도 전혀 없었다. 그래서 먼저 측정했다: nonce 프로브(aios agents probe --client <id>)가 부모 대화에 AIOS-NONCE-<16 hex>를 심고 자식에게 재암기를 요구한다 — codex는 직접 근거와 함께 fork로 답하고, pi는 subagent 도구면이 없다고 선언되어 not-applicable, unknown은 이유를 첨부한 정당한 결론이다. config/host-capabilities.json에는 subagents 사이드카 블록이 추가됐다(평가 축이 아니다 — 축을 늘리면 총점이 움직이고 보고서 동시 수정을 강요당한다). 에이전트 카드 지침을 단일 소유자로 수렴시켜 생성 카드 38/38장이 Output Contract를 정확히 1개만 갖게 했고, 모든 디스패치에 자체 완결된 ## Dispatch Brief를 주입한다 — 이것이 fork를 '금지'가 아니라 '무해'로 만드는 한 수다: 워커는 사실이 빠져 있으면 상속받은 컨텍스트에 기대지 않고 blocked를 반환한다. fs.readFileSync에 계측기를 달아 우리 문서 전제조차 반증했다: 10개의 shared native partial 중 loader가 실제로 읽는 것은 1개(core/core-instructions.md)뿐. 그래서 이제 모든 partial은 composed 또는 documentation-only 처분을 명시해야 하고 양방향 동작으로 검증된다. 과정에서 stripManagedTables도 고쳤다: TOML 테이블 이름을 표기 문자열로 비교해 같은 경로의 [projects.*]를 중복 생성했고, codex의 모든 명령을 exit 1로 만들었다. 게다가 하나의 스킵 플래그가 MANAGED_END까지 사람이 손으로 작성한 설정을 삼켜버리는 잠재적 데이터 손실 경로였다."
date: 2026-10-30
tags: ["AIOS", "v6.16.0", "서브에이전트", "신선한 컨텍스트", "Dispatch Brief", "능력 선언", "테스트", "release"]
---

# v6.16.0: 신선한 컨텍스트는 더 이상 행운이 아니다 — AIOS가 측정하고, 선언하고, 주입하고, fork를 무해하게 만든다

> **요약:** 당신의 대화를 상속한 서브에이전트는 당신의 **잘못된 전제**도 상속한다.깔끔한 디스패치 면이 하나,
> 완전히 무제약인 디스패치 면이 하나 있었다. 그리고 현장에서 가장 크게 들리던 주장("Codex는 기본으로 fork한다")은
> 타인의 단언이었고 로컬 근거는 0이었다. 이번 릴리스는 그것을 측정하고, 선언하고, **우리가 생성하는 산출물**에 제약을 적어 넣고,
> 그리고 그것을 걱정할 이유 자체를 없앴다: 자체 완결된 brief. `unknown`은 계속 정당한 답이다. 어떤 게이트도 기본으로 빨갛게 만들지 않는다.

## 우리가 베껴 쓰기를 거부한 전제

Matt Pocock의 skills 라인은 "신선한 컨텍스트"에 구체적인 공학 이유를 준다: 부모 transcript를 상속한 구현자는
부모의 **잘못된 전제**까지 함께 상속하고, 정작 봐야 할 컨텍스트를 얻지 못한다. 좋다. 그러나 "Codex는 기본으로 fork한다"는
우리의 세션에 외부 단언으로 들어왔다. 이 저장소의 규칙은 **측정하지 않은 것은 측정하지 않은 것으로 기록한다**.
그래서 지침을 한 줄 쓰기 전에 프로브부터 만들었다.

```
부모 대화   →  AIOS-NONCE-A8AF556CF1934014 를 심고 자식에게 재암기를 요구
자식 답변   →  재암기 성공        → fork
             재암기 불가 명시    → fresh
             그 외 모든 경우     → unknown + reason
```

실제 headless codex에서 `aios agents probe --client codex --json`의 결과:

```
verdict=fork  reason=child-reported-parent-nonce  confidence=indirect
```

……저장된 답변의 banner에는 session `01a18ae5-a4a8-7882-988d-60e1e98bdb53`이 그대로 남아 있어
누구나 확인할 수 있다. pi는 다른 답을 했다: 애초에 subagent 도구가 없으므로
`surface: none` / `contextMode: not-applicable`, confidence는 `direct`. 아직 8개 클라이언트가 `unknown`인데,
이것은 **의도된** 것이다.

## 두 개의 디스패치 면, 다르게 다룬다

| 디스패치 면 | v6.16.0 이전 | 이제 소유자 |
|---|---|---|
| AIOS가 띄우는 워커 | 구조적으로 새로움 — 다만 구현의 부수적 우연 | `one-shot.mjs`는 1회성 prompt만 전달. `RESERVED_FLAGS`가 `--resume` / `--continue`를 거부 |
| 호스트 자신의 Task/Agent 도구 | **제약 0**: 선언 없음, 측정 없음, 카드에 한 문장도 없음 | 프로브 → 선언 → 카드 조항 → Dispatch Brief |

구현 전체에서 정직함을 지켜준 세 가지 규칙:

- **`unknown`은 정당한 결론이다.** `fresh`를 기본값으로 두지도, blocker로 만들지도 절대하지 않는다.
- **사이드카이지 평가 축이 아니다.** `CAPABILITY_AXES`는 고정 token 집합. 축을 하나 늘리면 scorecard 총점이 움직이고
  보고서 동시 수정이 필수다. `subagents`는 옆에 달았으므로 `client-capability-scorecard.mjs --check`의 drift는 0이다.
- **모델의 자기 보고는 뒷받침이 될 수 있어도 창조는 될 수 없다.** pi가 "subagent 도구가 없다"고 말한 것이
  `direct` 근거가 되는 것은 **설정이 이미 `surface: none`을 선언하고 있었기 때문**이다. 선언되지 않은 클라이언트가 같은 말을 하면
  여전히 `unknown / no-subagent-spawned`다. 문장은 능력 사실을 만들지 못한다.

## 우리가 믿던 전달 면 — 그리고 믿음이 틀렸다

계획에는 이렇게 적혀 있었다: 공유 native partial에 규율을 넣으면 모든 클라이언트에 전달된다. 그래서 우리는
디렉터리 구조를 믿는 대신 `fs.readFileSync`에 계측기를 달고 10개 클라이언트의 실제 투영을 돌리며 **전달**을 측정했다:

```
core/core-instructions.md   →  composeNativeMarkdown()가 읽음, 10/10 클라이언트
나머지 9개 partial            →  아무도 읽지 않는다. 호출자 0
```

`readSharedMarkdownParts` — 그것들을 끌어올 유일한 함수 — 는 저장소 코드에도 설치된 런타임에도
호출 지점이 **존재하지 않는다**. 게다가 내 첫 번째 집계는 두 단계로 틀렸다: basename으로 grep 해서
"고아 7개"라고 보고했는데, 그건 docs와 blog의 **언급**을 참조로 세었기 때문이다. 실제 숫자는 9.
**"파일이 쓰였다"와 "모델이 읽었다"는 서로 다른 사실이다.**

따라서 전달 면은 정확히 두 곳이고, 두 곳 모두 우리 쪽이다:

- **워커 쪽** — 고정 조항 3개, 단일 소유자(`emitters/shared.mjs`): 부모 대화 상속 없음, brief와 그것이 지정한 ref로만 작업,
  사실이 빠져 있으면 `blocked`, 부모에게 transcript를 붙이게 하지 않음. 생성 카드는 실측으로
  **38/38장**이 세 조항을 모두 충족하고 Output Contract는 **정확히 1개**. 19개 role 소스에 손으로 옮겨 적시된
  낡은 필드 표(`agentId/blockers/evidenceRefs`)는 강제 schema와 서로 모순됐으므로 schema를 가리키는 한 줄 pointer로 바꿨다.
  낡은 표는 **source에서 지우지 않고 렌더링 때 제거**한다 — `REQUIRED_PROMPT_MARKERS`가 여전히
  `## Output contract` 헤딩의 존재를 요구하기 때문이다.
- **디스패처 쪽** — `## Dispatch Brief`: 순수 함수 하나로 만들고 렌더러 하나로 그려, **이미 존재하던** prompt
  조립기에 주입한다. 두 번째 조립기는 만들지 않았다.

fork는 여기서 정확성 문제에서 내려온다: 필요한 모든 사실이 brief에 있다면, 부모 컨텍스트를 상속해도
워커가 얻는 것은 없고 token만 낭비된다.

## 보고하는 게이트, 그리고 빨간 게이트

`aios status`는 모호한 한 단어가 아니라 분리된 사실을 보여준다:

```
subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
```

`fork`는 "측정됨"이라는 중립적 계산에 흡수되지 않고 위험 사례로 단독 표시되며, 전체는 `blockers` 밖에 놓인다 —
이 저장소는 `duplicateLines`에서 **처분 계획 없는 기본-빨강 게이트는 고쳐지는 대신 묵음화된다는 것을** 이미 배웠다.
실제로 빨개지는 것은 **전달 주장** 쪽이다: `native-partial-delivery.test.mjs`는 partial마다
`composed` 또는 `documentation-only` + 이유를 명시하도록 요구하고, `composed`는 동작으로 증명한다
(loader가 읽고 **그리고** 최종 산출물에 보이도록), `documentation-only`는 읽히지 않음을 증명한다.
양쪽 모두 게이트에 거짓말을 해서 검증했다: composed라고 거짓 선언하면 빨강, 몰래 전달했는데 선언을 안 바꾸면 빨강.

## 프로브가 가는 길에 넘어진 것들

- **`stripManagedTables`가 TOML 테이블 이름을 표기 문자열로 비교했다.** 같은 경로가 `"C:\\Users\\..."`와
  `'C:\Users\...'` 두 표기로 쓰이면 복호화 후 키 하나에 `[projects.*]` 테이블이 두 개 만들어지고, codex는
  완전히 작동을 멈췄다: `duplicate key`, exit 1, 모든 명령이. 같은 함수에 더 나쁜 결함이 숨어 있었다 —
  "관리 블록 안"을 나타내는 불리언이 하나뿐이라, 마크 없는 구형 AIOS 테이블에서 `MANAGED_END`까지
  **사람이 손으로 작성한 후속 설정을 삼켜 삭제**했다. 이제 테이블 정체성은 **복호화된 키**이며 `path.resolve()`로 비교하고,
  블록 상태도 둘로 나눴다.
- **호스트 banner가 분류기를 속였다.** 실제 codex 답변이 `answer-not-json`으로 기록됐다 —
  파서가 첫 `{`부터 마지막 `}`까지 잘라냈는데, banner가 echoed한 prompt가 그것을 망가뜨렸다. 지금은
  균형 잡힌 JSON 개체만 훑고 `subagentSpawned`를 가진 것 하나만 받는다. 그리고 명시적으로:
  **echoed된 nonce는 fork의 근거가 아니다**.
- **pi의 JSON 이벤트 스트림은 prompt를 echo한다**(nonce 포함). 원시 stdout을 분류하면 영구적인 가짜 `fork`가 나오므로,
  분류는 파싱된 `assistantText`만 읽는다.
- **근거 파일에 크기 상한을 뒀다.** 한 호스트 스트림은 실측 208,782자. 답변은 잘라 저장하고
  `answerLength` / `answerTruncated`를 함께 남긴다.
- **Windows shim이 버전을 주지 않았다.** `spawnSync('pi', …)`는 npm shim을 통과해 버전을 읽지 못한다.
  이것은 버전 드리프트 탐지를 **영구히 조용히 무력화**했다. 이제 버전 탐색도 platform spawn spec을 거친다 —
 여기의 다른 모든 것들과 마찬가지로 단일 소유자다.

## 이번 릴리스가 정직하게 남기는 공백

- 완료 정의의 **D3는 미달성**: hermetic 빈 세션에 brief**만** 주고 schema 적합 handoff를 내게 하는 실행은
  **한 번도 돌리지 않았다**. 기존 테스트가 증명하는 것은 구조적 사용 가능성이며, 정적 단언을 모델 실행의 대리자로 두지 않는다.
- 10개 클라이언트 중 8개가 미측정. 각각 실제 호스트 호출 1회가 필요하다.
- 9개 partial에는 규율 문장이 있지만 전달 면이 없다. 공유 `AGENTS.md`에 쓰면 subagent 도구가 없는
  클라이언트까지 지침이 새어 나간다. 그래서 그것은 별개의 설계 결정 — 이번 릴리스가 고정하는 것은
  **"파일을 쓰는 것은 전달이 아니다"**라는 한 가지뿐.
- 설치된 런타임의 `stripManagedTables`는 여전히 수정 전이다. 거기서 native install을 돌리면
  duplicate key가복제될 수 있다(갱신할 때까지).

## 사용해 보기

```bash
aios agents probe --client <id> --json      # 한 호스트의 컨텍스트 상속을 측정
aios agents probe --client <id> --dry-run   # 무엇을 실행할지만 출력. 모델 호출을 쓰지 않음
aios status                                 # subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
node scripts/aios.mjs standards --root . --rule directoryEntries
```

이 릴리스의 담보 근거: 전체 회귀 2484 tests / 2475 pass / 0 fail / 9 skipped;
probe + declaration + runner 세 스위트 28/28; 생성 카드 38/38이 정확히 1개의 계약; `check-syntax` 1296 파일 / 0 실패;
`scorecard --check`는 13개 클라이언트에서 ok, drift 없음; `check-doc-citations`의 invalid는 335 → 335 유지, refs는 542 → 563.

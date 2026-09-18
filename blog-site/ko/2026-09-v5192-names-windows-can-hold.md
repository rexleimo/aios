---
title: "v5.19.2: Windows가 감당할 수 있는 이름"
description: "후보 id는 정당하게 'session:<id>'이다. NTFS에서 이것을 파일 이름으로 쓰면 대체 데이터 스트림이 되어, 쓰기는 성공한 것처럼 보이고 readdir에는 결코 나타나지 않으며, 승격 레코드는 사라진다. 그런데도 가져오는 쪽은 오류 0건이라고 보고한다."
date: 2026-09-18
tags: ["AIOS", "evolution", "windows", "filesystem", "testing", "release", "v5.19.2"]
---

# v5.19.2: Windows가 감당할 수 있는 이름

엔터티 id와 파일 이름은 다른 것이다. 대부분의 경우 그 차이는 보이지 않아 둘은 혼용되고, 그러다 어느 플랫폼이 조용히 이의를 제기한다.

이 저장소에서 후보 id는 `session:<sessionId>`이다. 이 형태는 테스트 스위트가 단언하며 데이터 모델의 일부이고 바뀌지 않는다. 그 id를 그대로 파일 이름으로 쓴 곳이 세 군데 있었다.

## 성립하지 않는 콜론

`session:eval-001.json`은 POSIX에서 지극히 평범한 파일 이름이다. NTFS에서는 파일 이름조차 아니다. 콜론 뒤의 모든 것은 `session`이라는 파일의 **대체 데이터 스트림(ADS)**이 된다.

이것은 크래시보다 나쁜 실패 형태를 만든다. Windows에서:

```
writeFile('...promotions/session:session-import-0.json')  -> 성공
readdir('...promotions/')                                 -> []
```

쓰기는 성공을 보고한다. 디렉터리 목록에는 나타나지 않는다. `readPromotion`은 찾지 못하고, `listPromotions`는 빈 배열을 돌려주며, 방금 승격 세 건을 "썼다"는 가져오기 쪽은 `errors.length === 0`을 보고한다.

레코드는 저장되지 않았고, 그것을 말해 주는 것도 없었다.

## 세 명의 작성자, 세 가지 결과

같은 id가 세 경로로 파일 시스템에 도달했다:

**판정(verdicts)** 은 원시 id로 파일을 명명하고 원자적 이름 바꾸기로 썼다. 임시 파일은 스트림으로 만들어졌고, 최종 스트림 경로로의 이름 바꾸기가 `EINVAL: invalid argument, rename '...\.session:session-eval-001.json...'`로 실패했다. 적어도 소리는 냈다 —— 다만 Windows에서만.

**승격(promotions)** 은 더 나쁘다. `promotionPath()`는 id를 정화한 뒤 경로를 만들지만, 그 허용 목록은 `[^A-Za-z0-9._:-]`이며 **콜론을 남긴다**. 저장소는 스트림에 쓰고, `readdir`은 결코 보지 못하며, 승격은 사라졌다.

**통합 브리지(integration)** 는 두 번째 작성자를 직접 써 두었다:

```js
const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', `${promotionId}.json`);
await fs.writeFile(target, JSON.stringify(promotion, null, 2), 'utf8');
```

이 경로는 `promotionPath()`를 완전히 우회했다 —— 하나의 산출물에 두 명의 작성자, 일치하는 것은 운뿐이다.

## 수정

파생된 이름은 정화하고, id는 데이터로서 콜론을 유지한다.

```js
// scripts/lib/fs/file-segment.mjs
const ILLEGAL_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
export function sanitizeFileSegment(segment) {
  return String(segment ?? '').replace(ILLEGAL_FILE_NAME_CHARS, '-');
}
```

이 문자 클래스는 여기서 발명한 것이 아니다. memo 저장소 계층이 자기 경로에 대해 같은 집합을 이미 정규화하고 있었다. 다만 그 헬퍼들은 소문자화와 공백 축약도 하므로 불투명한 id에는 쓸 수 없다 —— 이것은 파일 이름이 담을 수 없는 문자만 제거한다.

결과는 셋이다. `writeVerdict`/`readVerdict`는 파생한 이름을 정화하므로 서로 계속 일치한다. `promotionPath()`는 허용 목록에서 콜론을 빼고 결과를 정화기에 통과시켜 보험으로 삼았다. `writePromotion`은 내보내지고, 통합 브리지는 자기 경로 대신 그것을 호출한다.

뒤에는 하나가 더 있었다. `atomicWriteText`는 임시 파일 이름 공식을 복제하면서 다른 원자적 쓰기가 가진 정리를 갖지 않아, 실패한 이름 바꾸기가 스트림 찌꺼기를 디스크에 남겼다. 이제 `writeFileAtomic`에 위임하고, 구현은 둘에서 하나가 되었다.

## 임시 디렉터리 안에만 존재하는 실패

`scripts/lib/fs/`에 파일 하나를 더하자 release-preflight 테스트 세 개가 깨졌다 —— 그런데 그 명령을 작업 트리에서 직접 실행하면 `exit 0`이다. 릴리스 픽스처는 `scripts/lib/fs/atomic-write.mjs`를 **명시적 단일 파일**로 복사했기에, 이 모듈이 새 형제를 import한 순간 픽스처 실행은 매번 **임시 루트** 안에서 `agent export regeneration failed`로 죽었다.

첫 직감은 "내 변경과 무관"이었다. 그것은 추측이므로 측정으로 바꿨다. 변경한 파일을 이전 커밋으로 되돌려 같은 테스트를 돌리면 통과하고, 되돌리면 실패한다. 직감이 틀렸다. 픽스처는 이제 `scripts/lib/clients`와 같이 디렉터리째 복사한다.

## 정직한 상태: 고쳤지만, 아직 배선하지 않았다

`evolution-integration.test.mjs`는 다섯 실패에서 종료 코드 0이 되었다. 그러나 여전히 어떤 테스트 진입점에서도 닿을 수 없다 —— 즉 이 수정은 아직 CI가 지켜 주지 않는다. 초록인 이유는 아무도 실행하지 않기 때문이다.

이것이 다음 단계이고 독립적인 단계다. `scripts/tests/`의 82개 테스트 파일은 모든 진입점에서 닿을 수 없고, 통과하기 전에 스위트로 배선하면 게이트를 빨갛게 만들 뿐이다. 먼저 고치고, 다음에 배선하고, 마지막에 기준선을 줄인다.

## 검증

- `node --test scripts/tests/evolution-integration.test.mjs` —— 다섯 실패에서 종료 코드 0
- `scripts/tests/artifact-filename-windows-safety.test.mjs` —— 신규, 배선됨, 다섯 케이스로 불변식을 POSIX에서도 고정한다(거기서는 이 실패가 재현되지 않는다)
- `npm run test:scripts` —— 1293 tests, 1285 pass, 0 fail

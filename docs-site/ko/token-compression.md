---
title: 네이티브 Token 압축
description: RTK, Caveman, 경쟁 shell hook을 설치하지 않는 RexCLI 입력/출력 token 절감 워크플로.
---

# 네이티브 Token 압축

## 빠른 답변

RexCLI는 token 절감을 네이티브로 처리합니다. RTK 스타일 입력 필터링과 Caveman 스타일 짧은 출력을 참고하지만, RTK, Caveman, shell hook, 경쟁 CLI는 **설치하지 않습니다**.

워크플로는 두 레이어입니다.

1. **입력 압축**: ContextDB packet, 브라우저 읽기, 명령 출력을 모델에 넣기 전에 줄입니다.
2. **출력 압축**: 명령, 경로, 오류, selector, 날짜, 위험, 검증 공백을 유지하면서 Agent 답변을 짧게 만듭니다.

## 입력 압축

### ContextDB Packet

내장 `context:pack` strategy engine을 사용합니다.

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

Strategies:

| Strategy | 사용 시점 | 동작 |
|----------|-----------|------|
| `legacy` | 엄격한 하위 호환 | tail-window behavior |
| `balanced` | 권장 기본값 | 낮은 신호 텍스트를 압축한 뒤 drop |
| `aggressive` | 매우 좁은 token budget, 명시 opt-in | 더 강한 압축과 clipping |

안전 규칙:

- 중요한 오류, 실패 용어, 파일 경로, 명령 신호, 최신 상태를 보존합니다.
- 이벤트를 버리기 전에 반복 줄, stack trace, 낮은 신호의 줄 묶음을 압축합니다.
- 보호 이벤트를 자르기 전에 낮은 우선순위 이벤트를 먼저 버립니다.
- telemetry: `strategy`, `rawTokenUsed`, `compressed`, `dropped`, `truncated`를 출력합니다.

### 브라우저 읽기

`aios-browser-compress`로 압축된 증거를 우선합니다.

1. `page.semantic_snapshot`
2. targeted `page.extract_text`
3. full `page.extract_text`
4. `page.get_html`
5. 시각 증거가 필요할 때만 screenshot

click, type, publish, delete 전에 압축된 view가 대상 존재를 증명하지 못하면 좁게 다시 읽습니다.

### CLI 출력

shell hook을 설치하지 않습니다. 도구에 범위를 좁힌 출력을 요청합니다.

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

## 출력 압축

`aios-compress`로 답변 스타일을 제어합니다.

| Level | 사용 사례 | 동작 |
|-------|-----------|------|
| `tight` | 일반 개발 | 간결한 기술 답변, 군더더기 없음 |
| `ultra` | harness logs, checkpoints | 한 줄 증거 + 다음 action |
| `precise` | browser actions, safety, irreversible actions | 완전하고 명시적인 표현 |

Controls:

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

## 왜 네이티브인가

네이티브 압축은 Codex와 Claude에서 감사 가능하고 일관성을 유지합니다.

- 경쟁 의존성 없음.
- 전역 명령 재작성 없음.
- 숨은 shell 동작 없음.
- docs, skills, code가 이 repo 안에 있음.
- 검증으로 무엇이 압축/삭제되었는지 확인 가능.

## 관련 파일

- `mcp-server/src/contextdb/core.ts`
- `skill-sources/aios-compress/SKILL.md`
- `skill-sources/aios-browser-compress/SKILL.md`
- `.codex/skills/aios-compress/SKILL.md`
- `.codex/skills/aios-browser-compress/SKILL.md`
- `.claude/skills/aios-compress/SKILL.md`
- `.claude/skills/aios-browser-compress/SKILL.md`

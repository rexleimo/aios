---
title: v5.12.0 메모리 시스템 마무리——저장에서 운영으로: 하이진, 리포트, 마이그레이션 임포트, 티어 로딩
date: 2026-09-09
description: "memo 하이진 명령(삭제 없음), aios memory report로 메모리 전체 가시화, aios import로 기존 메모리를 거버넌스 후보로 이전, AgentView T0-T3 티어, Autodream opt-in 트리거, embedding 러프 랭킹은 기본 꺼짐. 실제 코퍼스 기준 top-1 98%."
---

# v5.12.0 메모리 시스템 마무리——저장에서 운영으로: 하이진, 리포트, 마이그레이션 임포트, 티어 로딩

> 2026-09-09 · 메모리 backlog 13개 항목 전부 클로즈(10개 구현 + 3개 검증, 이 중 2개는 이미 출하된 상태에서 기록만 누락됐었음). 회귀 1106 테스트 / 0 실패.

## 퀵 답변

v5.11.0이 "쓰기 gate"를 만들었다면 이번엔 "저장 후 운영"입니다: pinned 한도 초과 경보와 정리 입구 제공(아카이브만, 삭제는 절대 없음), 명령 하나로 메모리 전체 가시화, 기존 메모리를 거버넌스 큐로 이전, 서브에이전트 컨텍스트 4 티어 + 예산 산출, Autodream opt-in 자동 트리거. 파괴적 변경 없음, pull 하면 바로 사용 가능.

```bash
aios memo hygiene          # 읽기 전용 점검 + 정리 제안
aios memory report         # space별 볼륨/무효화율/후적체류/채택률
aios import --format claude --file ~/MEMORY.md --dry-run
```

## 주요 변경

- **memo hygiene(E2+E3)**: survey는 sessions/pinned/이벤트 크기를 나열; `--archive-stale-sessions`는 이동 아카이브(충돌 시 거부), `--rotate-events`는 keep-newest 로테이션(moved+kept 대조 + sha256); 삭제 없음, space 레벨 활성 session은 아카이브 대상 제외.
- **memory report(G2)**: space별 볼륨/무효화율/후보 4 상태/feedback 채택률/pinned 예산. `--json` 지원, doctor와 역할 분리.
- **aios import(F3)**: Claude/Continue/Roo/CONVENTIONS 4 포맷 → 거버넌스 candidate(게시 권한 없는 identity로 기록, B1 우회 불가), 멱등 + `#import-<format>` 태그, 가이드는 `docs/import-migration.md`.
- **점진적 공개 + pinned 예산(C3+C4)**: `search --level summary`는 행당 약 100 토큰 + `pack:` 푸터; `pin status`는 사용량 트리플 출력, 초과 시 truncated.
- **AgentView 티어(H1)**: T0-T3 4 티어 + 티어별 문자 예산 장부; `ctx-agent.mjs workspace-view`는 pull 방식 읽기, 기본 T3이라 기존 호출자 무영향.
- **Autodream Phase B(E1)**: `AIOS_AUTODREAM_AUTO=1`로 close+유휴 듀얼 트리거, preview만 실행해 거버넌스 apply로; dream은 LLM 제로라 최저가 루트는 자명.
- **embedding 러프 랭킹 + 실제 코퍼스 기준(A4+G1)**: `AIOS_MEMO_EMBEDDER=hash-lexical` 기본 꺼짐, union-only 추가만(AB 제5암 제로 드리프트); 실제 코퍼스 기준 top-1 98% / top-5 100%.
- **검증으로 클로즈(C1/C2/F2)**: 예산 강등 투영과 orchestrate 호출 체인은 구현 완료; refs/canvas은 예전부터 출하; generatedTargets는 능력 유래로 하드코딩이 아님, 격차는 workbuddy 1건으로 축소. F1은 낙관적 잠금 충돌 시 자동 마커 흔적 추가.

## 업그레이드

파괴적 변경 없음. 회귀 1106 테스트 / 0 실패(101 파일, 신규 9 스위트 포함), AB 5암 제로 드리프트.

---
title: "ContextDB 검색 업그레이드: FTS5/BM25 + 증분 인덱스 동기화"
description: "SQLite FTS5, BM25, refs 정확 일치, 관측 가능한 증분 동기화로 AI 에이전트 기억 검색을 안정화하는 방법입니다."
date: 2026-06-18
tags: ["ContextDB", "FTS5", "BM25", "에이전트 기억", "검색"]
---

# ContextDB 검색 업그레이드: FTS5/BM25 + 증분 인덱스 동기화(P1.5)

> **Quick Answer:** ContextDB는 SQLite FTS5와 BM25로 후보를 정렬하고 정규화된 `event_refs`로 정확히 필터링하며 `index:sync --stats`로 증분 동기화를 관찰합니다. CI에서는 `--jsonl-out`으로 기계 판독 가능한 실행 이력을 저장할 수 있습니다.

ContextDB는 P1에서 검색 기본 경로를 SQLite FTS5 + BM25로 전환했습니다.  
P1.5에서는 운영 관측성과 성능 관리까지 확장했습니다.

- 증분 sidecar 동기화 관측 (`index:sync --stats`)
- 동기화 메트릭 JSONL 기록 (`--jsonl-out`)
- `event_refs` 정규화 테이블 기반 refs 정확 일치 필터
- refs 쿼리 벤치마크 및 CI gate 스크립트

## 왜 추가로 개선했나

FTS5/BM25 전환 후에도 실무에서 두 가지 공백이 있었습니다.

- 동기화 실행별 구조화 지표가 없어 인덱스 신선도/비용 추적이 어려움
- 대규모 데이터셋에서 refs 필터 정확도 보장을 더 강화할 필요

P1.5는 기존 워크플로우를 깨지 않고 이 문제를 보완합니다.

## 현재 동작

`contextdb search`와 인덱스 유지 흐름은 다음과 같습니다.

1. SQLite FTS5 `MATCH`
2. `kind/text/refs` 대상 BM25(`bm25(...)`)
3. FTS 미지원 환경에서는 lexical 자동 폴백
4. 정규화 `event_refs` 기반 refs 정확 일치(부분 문자열 모호성 제거)
5. `index:sync` 증분 갱신(`index:rebuild` 전체 재구축도 유지)

## 명령어

```bash
cd mcp-server
npm run contextdb -- search --query "auth race" --project demo --refs auth.ts
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

로컬 튜닝용:

```bash
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
```

## 실무 영향

- 동기화 품질/비용(`scanned/upserted`, 처리 시간, throttle skip)을 지속 관측 가능
- 대규모 데이터에서 refs 필터 오탐 감소
- refs 쿼리 지연/히트율 회귀를 CI gate로 차단
- 장기 세션/크로스 CLI 핸드오프에서 매번 전체 재구축 없이 안정 운영

## 자주 묻는 질문

### BM25가 refs 정확 일치 필터를 대신하나요?

아닙니다. BM25는 텍스트 후보의 순위를 정하고, 정규화된 `event_refs`가 그 뒤에 정확한 참조 조건을 적용합니다.

### 매번 인덱스 전체를 다시 만들어야 하나요?

아닙니다. 일반 유지 관리에는 증분 `index:sync`를 사용하고, 복구나 마이그레이션처럼 전체 갱신이 명확히 필요한 경우에만 `index:rebuild`를 사용합니다.

### 현재 구현을 확인할 공식 문서는 어디인가요?

[ContextDB 문서](https://cli.rexai.top/ko/contextdb/), [Token Intelligence](https://cli.rexai.top/ko/token-compression/), [Troubleshooting](https://cli.rexai.top/ko/troubleshooting/)를 확인하세요.

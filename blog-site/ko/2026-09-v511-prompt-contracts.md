---
title: v5.11.0 프롬프트 계약 강화——추측 대신 자가 선언
date: 2026-09-06
description: "메모 5요소 추출, 검증 스코어 루프, 스턱 자가 보고, 압축 티어, 약모델 고정, 노드 레시피, planning ledger. 7개 프롬프트 계약으로 모델이 상태를 스스로 보고하게 합니다. 런타임 변경은 없고 저장소를 받아 투영만 갱신하면 적용됩니다."
---

# v5.11.0 프롬프트 계약 강화——추측 대신 자가 선언

> 2026-09-06 · 프롬프트 전용 릴리스：7개 skill 계약 업데이트, 런타임 변경 없음, breaking 없음.

## 빠른 답변

경쟁 분석 중 "프롬프트만 가져올 절반"을 반영：기억·검증·스턱·압축·라우팅·병렬·계획을 구조화된 자가 선언 계약으로. 업데이트는 pull + `node scripts/sync-skills.mjs`, `rex-planning`은 `aios setup` / `aios update`로 갱신.

## 핵심 변경

- **메모 5요소 추출**：`fact` / `entities[]` / 절대 날짜 / `evidence_ref` / `confidence`.
- **검증 스코어 루프**：`score` / `complete` / `missing[]` 다음 라운드로, 재시도 예산 기본 3.
- **스턱 자가 보고**：매 라운드 `progress_made` + `blocked_reason`, 3연속 시 전환.
- **압축 티어**：`FULL` / `PARTIAL` / `SUMMARY` / `EXCLUDED`, 최근 2라운드 보호.
- **약모델 고정 + 예산 선언**：주변 작업은 저비용 모델 고정, 다운그레이드만.
- **노드 레시피**：7항목 헤더, 하류는 schema 산물로 트리거.
- **planning ledger**（서브모듈）：매 라운드 ledger + partial 재개 핸들.

## 업그레이드

Breaking 없음. 효과 미측정, 퇴화 없음은 검증됨（전체 스위트 green）.

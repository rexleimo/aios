---
title: "RexCLI 업데이트: Windows 네이티브 지원 + 라이브 비용 추적"
description: "RexCLI는 완전한 Windows 워크플로, 라이브 API 비용 텔레메트리, OpenCode Agent 통합 등 주요 업데이트를 제공하여 더 투명한 AI 개발을 가능하게 합니다."
date: 2026-03-16
tags: [RexCLI, Windows, Cost Tracking, OpenCode, AI Development]
---

# RexCLI 업데이트: Windows 네이티브 지원 + 라이브 비용 추적

이번 업데이트는 AI 지원 개발을 더 신뢰할 수 있고 투명하게 만드는 다수의 개선을 제공합니다.

## Windows 네이티브 워크플로 지원

RexCLI는 이제 Windows 워크플로를 엔드투엔드로 지원합니다. Windows 고유의 경로 처리 및 명령줄 인수 분할 문제를 해결하여 Windows 개발자도 동일한 워크플로를 원활하게 사용할 수 있게 되었습니다.

주요 개선 사항:

- 네이티브 Windows 경로 처리（예: `C:\Users\...`）
- cmd 기반 래퍼의 더 안전한 시작 동작
- Windows에서 Codex 인수 분할 문제 위험 감소
- 非git 워크스페이스의 우아한 저하 지원

관련 문서: [Windows 가이드](/ko/windows-guide/)

## 라이브 비용 추적（비용 텔레메트리）

라이브 비용 텔레메트리은 실시간으로 API 사용 비용을 파악하는 데 도움이 됩니다. 장기 실행 작업 중 RexCLI는 다음을 추적하고 표시할 수 있습니다:

- 토큰 사용량
- 비용 요약
- 예산 관리
- 예산 임계값 초과 시 경고

`aios orchestrate` 실행에서 비용 텔레메트리을 확인할 수 있습니다.

## OpenCode Agent 지원

RexCLI는 OpenCode Agent 지원을 통합하여 다음을 가능하게 합니다:

- OpenCode의 agent 에코시스템 활용
- 더 유연한 오케스트레이션 및 디스패치 전략 실행

## 관련 링크

- 문서: `/getting-started/`
- 레포: <https://github.com/rexleimo/rex-cli>

---
title: Superpowers
description: CLI를 더 똑똑하게 만드는 재사용 가능한 자동화 스킬. 사용 사례별로 정리되어 있습니다.
---

# Superpowers

> **Quick Answer:** Superpowers는 brainstorming, planning, TDD, debugging, verification, parallel dispatch, security review를 위한 재사용 가능한 playbook입니다. 먼저 워크플로 라우트를 선택하고 그 경계에 맞는 최소 skill만 사용하세요.

## 라우트 다음에 skill 고르기

읽기 전용 질문은 direct로 유지해도 됩니다. 파일 변경 전 `pre-edit-safety-gate`와 완료 주장 전 최종 검증은 skill 선택과 별도의 게이트입니다.

Superpowers는 재사용 가능한 자동화 스킬입니다. Claude Code, Codex, Gemini CLI, OpenCode에 후킹해서 반복 작업을 자동 처리합니다.

같은 명령이나 프롬프트를 반복하는 대신, 검증된 워크플로우를 통해 AI를 안내하고 모범 사례를 시행하며 완료 전에 결과를 검증하는 스킬을 호출하세요.

---

## 🚀 시작하기

명확성과 구조를 갖춘 새 작업을 시작하는 스킬.

<div class="skill-grid">
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">💡</div>
      <div class="skill-card__name">brainstorming</div>
    </div>
    <div class="skill-card__desc">창작 작업 시작 전에 의도를 명확히. 컨텍스트 탐색, 명확화 질문, 트레이드오프가 있는 접근법 제안, 코딩 전 승인 받기.</div>
    <div class="skill-card__example">brainstorming으로 이 기능을 어떻게 구현할지 생각해줘</div>
  </div>
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">📝</div>
      <div class="skill-card__name">writing-plans</div>
    </div>
    <div class="skill-card__desc">요구사항을 실행 가능한 계획으로 변환. 요구사항 분석, 순차적 스텝 분해, 의존성 파악, 상세 계획 문서 출력.</div>
    <div class="skill-card__example">writing-plans으로 이 요구사항을 단계로 나눠줘</div>
  </div>
</div>

---

## 🐛 디버깅 및 검증

증거에 기반해 버그를 수정하고 품질을 보장하는 스킬.

<div class="skill-grid">
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔍</div>
      <div class="skill-card__name">systematic-debugging</div>
    </div>
    <div class="skill-card__desc">증거로 버그 고치기. 증상과 에러 메시지 수집, 가설 형성, 체계적 테스트, 수정 검증.</div>
    <div class="skill-card__example">버그가 있어, systematic-debugging 사용해줘</div>
  </div>
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">✅</div>
      <div class="skill-card__name">verification-before-completion</div>
    </div>
    <div class="skill-card__desc">증거 없이 완료라고 말하지 마. 검증 명령 실행, 출력이 기대대로인지 확인, 성공 주장 전 구체적 증거 필요.</div>
    <div class="skill-card__example">완료 전에 verification-before-completion으로 검증해줘</div>
  </div>
</div>

---

## ⚡ 효율성 및 협업

더 빠르게 실행하고 규모 있게 협업하는 스킬.

<div class="skill-grid">
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">⚡</div>
      <div class="skill-card__name">dispatching-parallel-agents</div>
    </div>
    <div class="skill-card__desc">여러 독립 작업을 한번에 실행. 독립 워크플로 식별, 병렬 에이전트 기동, 결과 취합, 우아한 실패 처리.</div>
    <div class="skill-card__example">dispatching-parallel-agents로 이걸 병렬 처리해줘</div>
  </div>
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">👥</div>
      <div class="skill-card__name">team-ops</div>
    </div>
    <div class="skill-card__desc">HUD와 Team 상태 도구로 다중 에이전트 협업 모니터링 및 관리. 실시간 세션 상태 보기, 결과 추적, 스킬 개선 후보 발견.</div>
    <div class="skill-card__example">team-ops 모니터링 패널 보여줘</div>
  </div>
</div>

---

## 🔒 보안 및 규정 준수

자동화를 안전하게 유지하는 스킬.

<div class="skill-grid">
  <div class="skill-card skill-card--security">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔒</div>
      <div class="skill-card__name">security-scan</div>
    </div>
    <div class="skill-card__desc">자동화 전에 설정의 보안 문제 확인. 스킬, 훅, MCP 설정 스캔, 노출된 시크릿 식별, 수정 제안.</div>
    <div class="skill-card__example">security-scan 실행해서 설정 보안 확인해줘</div>
  </div>
</div>

---

## RL 훈련 시스템

AIOS RL 계층은 shell, browser, orchestrator 작업을 가로지르는 실험·훈련 제어면입니다. 공개 워크플로의 편집 게이트와 최종 검증을 대체하지 않습니다.

## FAQ

### Superpowers가 모든 질문에서 실행되나요?

아닙니다. 질문과 상태 확인은 direct로 유지하고 설계, 순서, 디버깅, 위임, 완료 근거가 필요할 때 playbook을 고릅니다.

### skill은 어디에 설치되나요?

저장소에서 발견 가능한 skill은 `.codex/skills/` 또는 `.claude/skills/`에 두며 지원 워크플로가 클라이언트에 투영합니다.

## 공식 문서

[워크플로 정책](workflow-policy.md), [빠른 시작](getting-started.md), [Agent Team](team-ops.md)부터 시작하세요.

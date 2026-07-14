---
title: "v3.20 Harness 신뢰성 개선: 실패 분류, 백오프 상한, dry-run readiness"
description: "Harness CLI v3.20이 일반 실패와 인프라 장애를 분리하고, 제한된 백오프와 dry-run readiness로 장시간 작업을 안정화하는 방법을 설명합니다."
date: 2026-07-12
tags: ["Harness CLI", "신뢰성", "solo harness", "실패 처리", "release"]
---

# v3.20 Harness 신뢰성 개선: 실패 분류, 백오프 상한, dry-run readiness

> **Quick Answer:** v3.20은 “시도가 실패했다”와 “인프라를 일시적으로 사용할 수 없다”를 따로 셉니다. `consecutiveFailures`는 모든 비성공 outcome을 기록하고, `consecutiveInfraFailures`는 인프라 재시도와 runtime/tool error만 기록합니다. 백오프에는 300초 상한이 있으며 dry-run은 설정의 유효성과 provider의 실제 사용 가능성을 분리해 보고합니다.

장시간 작업에서 어려운 점은 첫 실패가 아니라 실패 후 시스템이 자신의 상태를 설명할 수 있는가입니다. “retrying”만 표시하면 입력이 잘못된 것인지 모델, 도구, 네트워크가 잠시 불가능한 것인지 알 수 없습니다. v3.20은 관찰 가능한 실패 의미를 중심으로 개선되었습니다.

## 두 카운터가 해결하는 문제

### `consecutiveFailures`

blocked, failed, infra-retry, human-gate를 포함한 모든 연속 비성공 outcome을 기록합니다. “현재 목표가 몇 번 연속 완료되지 않았는가?”를 보여 줍니다.

### `consecutiveInfraFailures`

infra-retry와 runtime-error/tool-error 같은 인프라 장애만 기록합니다. “재시도할 만한 실행 환경 문제가 계속되는가?”를 보여 줍니다.

두 숫자는 서로 대체할 수 없습니다. 사람의 게이트에서 blocked된 작업과 브라우저 프로세스가 종료된 작업은 총 실패 횟수를 늘릴 수 있지만 복구 방법은 다릅니다.

## 백오프에 상한이 필요한 이유

재시도는 provider, 브라우저, 도구가 복구할 시간을 줘야 합니다. 하지만 상한 없는 백오프는 일시적인 문제를 사용자가 판단할 수 없는 긴 대기로 바꿉니다. v3.20은 대기 시간을 300초로 제한합니다.

1. outcome과 실패 분류를 기록합니다.
2. 복구 가능한 인프라 장애에는 백오프합니다.
3. 한 번의 대기가 300초를 넘지 않게 합니다.
4. 중지 조건이나 사람의 처리가 필요한 이유를 명확히 보고합니다.

모든 오류를 자동 재시도한다는 뜻은 아닙니다. 업무 실패, blocked, human-gate에는 서로 다른 다음 단계가 필요합니다.

## dry-run readiness는 “명령이 실행된다”와 다르다

입력과 설정 검사를 통과해도 provider, 로그인된 브라우저, 사람의 승인이 없을 수 있습니다. 따라서 상태는 최소한 다음을 구분해야 합니다.

- 입력과 설정 형식이 올바름;
- 로컬 런타임 검사를 통과함;
- 외부 의존성에 연결할 수 있음;
- 사람의 승인 필요 또는 blocked 상태.

이 구분은 CI, solo harness, 팀 인수인계에서 다음 행동을 판단하게 해 주며 dry-run 성공을 live 실행 성공으로 잘못 기록하지 않게 합니다.

## 이 정보를 언제 사용할까?

복구 가능한 장시간 작업을 실행할 때는 실패 분류와 최근 outcome부터 확인하세요. 단순한 재시도 횟수만 보고 기다릴지, 입력을 고칠지, 다시 로그인할지, 사람에게 처리 요청을 할지 결정하지 않는 것이 좋습니다.

[문제 해결](https://cli.rexai.top/ko/troubleshooting/)과 [Solo Harness](https://cli.rexai.top/ko/solo-harness/)를 함께 사용하면 실패를 고립된 로그가 아니라 인수인계 정보로 바꿀 수 있습니다. [아키텍처](https://cli.rexai.top/ko/architecture/)에서는 상태와 컨텍스트의 경계를 설명합니다.

## FAQ

### 모든 실패가 `consecutiveInfraFailures`에 들어가나요?

아닙니다. 인프라 재시도와 runtime/tool error가 대상입니다. blocked, 일반 실패, human-gate는 총 실패 카운터나 해당 상태에 반영됩니다.

### 300초 후에는 반드시 중지하나요?

아닙니다. 300초는 한 번의 백오프 상한입니다. 계속할지는 outcome, 중지 조건, 사람의 게이트에 따라 결정됩니다.

### dry-run이 통과하면 live 확인을 생략해도 되나요?

안 됩니다. dry-run은 입력과 설정이 로컬 검사에서 수락되었다는 뜻일 뿐 외부 provider, 브라우저 세션, 계정의 사용 가능성을 증명하지 않습니다.

### 업무 로직도 바뀌나요?

주로 harness의 상태 표현, 재시도 리듬, readiness 보고를 개선합니다. 다음 행동은 실제 outcome과 사람의 요구사항으로 판단해야 합니다.

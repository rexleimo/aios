---
title: "v2.0.2: Safer Skill Health Records and Cleaner Crush Config"
description: "Harness CLI v2.0.2는 skill health telemetry, help routing, repository의 Crush config hygiene을 개선합니다."
date: 2026-06-15
tags: ["release", "CLI", "skills", "Crush", "configuration"]
---

# v2.0.2: Safer Skill Health Records and Cleaner Crush Config

v2.0.2는 작은 수정 릴리스입니다. 목표는 local agent state 를 더 정확하게 유지하고, 새 CLI surface 를 더 쉽게 탐색하며, machine-local config 를 repository 에서 분리하는 것입니다.

## Skill health 는 알 수 없는 status 를 거부합니다

`recordSkillObservation()` 은 이제 `success` 와 `failure` 만 허용합니다. 다른 값은 저장 전에 예외가 되어 producer typo 나 legacy value 가 failure rate 를 오염시키지 않습니다.

## Help 가 먼저 처리됩니다

`aios skill ... --help` 와 `aios session ... --help` 는 필수 positional argument 검증보다 먼저 usage 를 보여줍니다.

```bash
node scripts/aios.mjs skill --help
node scripts/aios.mjs skill comply --help
node scripts/aios.mjs session --help
node scripts/aios.mjs session changed-files --help
```

## Crush config 는 tracking 대상이 아닙니다

`.crush.json` 과 `crush.json` 은 git tracking 에서 제거되고 `.gitignore` 에 추가되었습니다. AIOS 는 필요할 때 local Crush config 를 생성/읽을 수 있지만, 그 config 는 machine-local state 로 취급합니다.

## Verification

이 릴리스에는 invalid skill health status 와 help-first parser behavior 에 대한 regression test 가 포함됩니다. docs/blog site 도 다시 생성됩니다.

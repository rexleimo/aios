---
title: "v6.1.0: Browser MCP 기본값 끄기 — 설치 시 3개 중 1택, 언제든 전환"
description: "v6.1.0은 모든 머신에 Browser MCP를 자동으로 설치하지 않습니다. 설치 시 none / playwright / bsk 중 하나를 고르면, AIOS는 고른 engine만 각 client에 materialize합니다. 기본값은 가장 무거운 쪽, 즉 꺼짐입니다."
date: 2026-09-23
tags: ["AIOS", "browser-mcp", "memory", "default-off", "release", "v6.1.0"]
---

# v6.1.0: Browser MCP 기본값 끄기 — 설치 시 3개 중 1택, 언제든 전환

> **Quick Answer:** 예전에는 browser automation이 기본값으로 켜져 있었습니다. 각 머신마다 full Browser MCP가 materialize되었습니다. 각 client의 Browser MCP는 Chrome을 띄우지만, framework은 그것을 완전히 해제하지 못했습니다. v6.1.0은 기본값을 「꺼짐」으로 바꿉니다. 설치 시 **`none`** / **`playwright`** / **`bsk`** 중 하나를 고르면, AIOS는 고른 engine을 씁니다. 이 choice는 settings에 남고, 1개 command로 언제든 바꿀 수 있으며, 각 client 뒤의 writer는 모두 end-to-end로 이를 존중합니다. 무거운 쪽이 기본값이 되었으니, 깔기만 해도 기본값이 가볍고 조용해집니다.

## The problem: 한 번 켜지면 꺼지지 않는 자동화

workflow는 browser를 움직일 수 있었습니다. 모자랐던 것은 능력이 아니라 **비용**, 그리고 그 비용을 누가 내느냐는 점이었습니다.

1. **browser를 쓰지 않는 머신도 browser 비용을 냈습니다.** Browser MCP는 `.mcp.json`을 materialize하는 시점에 기본값 켜짐이었습니다. 그래서 AIOS를 깐 순간, 쓰든 안 쓰든 설정에 browser runtime이 놓입니다.
2. **memory 비용은 실제로 있었고 복리로 늘었습니다.** 최근 조사에서, 주된 무거움은 ~75개 process가 아니라 **7개 `browser-mcp`가 각각 자기 Chrome을 띄우고 있음**이 드러났습니다. 수백MB씩입니다. 실제로 page를 보지 않는 session도 그 비용을 키웁니다.
3. **죽은 client는 스스로 해제하지 못했습니다.**대화형 `ctx-agent`는 `spawnSync` shell이며, 깬 뒤 뒷정리를 하지 않습니다. 그래서 browser가 한 번 뜨면, framework에는 이를 해제할 장치가 없고, idle 때 해제할 기제도 없었습니다.
4. **출구가 없었습니다.** 「browser automation」을 쓰고 싶은 사람은, 만들어진 설정을 손으로 지워야 했고, 실제 사람들은 그런 일을 자주 하지 않습니다.

이번 수정이 노린 것은 browser를 「choice제」로 만들고, 때로 각 agent가 완전히 분리돼 움직이게 하며, user에게 1개 switch를 주는 것입니다.

## v6.1.0에서 바뀐 것

### 1. 기본값으로 Browser MCP를 넣지 않음

Browser MCP는 설치 시 자동으로 켜지지 않게 되었고, 기본값은 **`none`**입니다. operator가 입을 열기 전까지, browser 관련 줄은 1개도 설정에 쓰지 않습니다. 가장 무거운 쪽을 기본값으로 고른 것은 일부러입니다. browser를 쓰고 싶을 때만 넣고, 필요 없으면 1개 비용도 내지 않습니다.

이것은 「browser automation이 optional」이 아니라 「browser automation이**명시적**」입니다. 필요할 때는 완전히 갖춰집니다. 필요 없으면 framework은 조용히 스스로 열지 않습니다.

### 2. 설치 시 3개 중 1택, 3개 mode는 상호배타

설치 시(또는 언제든)는 1개만 고릅니다:

| mode | 주는 것 | 언제 고르는가 |
| --- | --- | --- |
| **`none`** (기본값) | Browser MCP를 완전히 넣지 않음. Chrome도 browser 별명도 제로. | 대부분 user. browser는 「쓸 때 집는」tool이며, 상시 ON이 아님. |
| **`playwright`** | 저장소 안 Node/Playwright runtime(각 agent가 독립 기동) + launch snippet. | 프로그램식 browser 제어와 Playwright가 주는 분리가 필요할 때. |
| **`bsk`** | 진짜사람 session식 자동화: 로그인한 Chrome을 확장 + local daemon으로 씀. | 진짜사람 session이 필요하고, 사람이 진짜사람으로 request에 답하며 drive할 때. |

3개는 구조상 상호배타입니다. 고른 engine만 client에 materialize되고, 바꾸면 옛 별명을 떨구고 옛 것도 지웁니다.

### 3. mode 이음새: writer가 end-to-end로 존중

전체가, 모든 writer가 나누는 이음새 `mcp-mode.mjs`에 올라 있습니다:

- `browserManagedServer`는 `none`과 `bsk`에 `null`을 돌려줍니다. 각 client 설정에서 **browser 별명이 drop**되고, **옛 것이 삭제**됩니다——Cod TOML, OpenCode, Hermes YAML, ZCode, Gemini, 그리고 공유 migration path입니다.
- **Playwright만의 runtime check**는 gate에 막힙니다. `none`/`bsk`를 고르면 저장소 안 Node/Playwright installer를 그대로 skip합니다.
- 각 writer는 설정에서 mode를 `resolveBrowserMode`로 읽고, 그에 따라 materialize합니다. 그래서 이 choice는 전 client에서 일관됩니다.

### 4. 1개 command로 언제든 바꿈

mode는 settings 안 1개 data이므로 lock되지 않습니다:

```bash
aios internal browser switch playwright   // 또는: bsk | none
```

이 1개 command는 **전 client**에 다시 materialize합니다. 같은 `mcp-migrate` path를 쓰고, 현재 client도 1걸음에 새 engine으로 바꿉니다. `bsk`로 바꾸면 AIOS는 3step guide(CLI → 확장 넣고 Connect → run)와 `browser_*` → `bsk` tool map을 냅니다. `playwright`로 돌아가면 guide는 사라집니다.

### 5. BSK: 경고만, 단단히 깨지지 않는 connectivity baseline

BSK는 진짜사람 session식 browser automation입니다——확장과 local daemon으로 로그인한 Chrome을 쓰고, Playwright와 상호배타입니다. CLI·daemon·확장 3개가 동일 version으로 맞아야 하므로, v6.1.0은 「connectivity 있음」이라 하지 않고 connectivity baseline을 보는 `bsk-doctor`를 마련했습니다:

```bash
aios internal browser bsk-doctor
```

- `bsk status --json`을 읽고, `version_skew:false`를 건강한 baseline으로 봅니다(CLI/daemon/확장이 모두 동일 version).
- `bsk` CLI가 없으면 **경고만**(owner action: `install.ps1 --browser bsk` run) 하고 다음으로 갑니다. session을 단단히 깨지 않습니다.
- daemon이 아직 connectivity 안 했으면 「Connect」를 누르라 재촉하고 그대로 이어갑니다.

이것은 일부러입니다. 단단히 하는 doctor는 「아직 connectivity 안 함」을 「단단한 blocker」로 바꿉니다. browser doctor는 재촉해야지 막으면 안 됩니다.

## 왜 이것이 Traditional agent보다 한 발 앞인가

Traditional coding agent는 install한 순간 모든 힘을 넣고, 넣은 채 멈추지 않습니다——Chrome은 상시, 별명은 설정에 자고, 깨끗이 멈출 길이 없습니다. AIOS는 이미 flow를 돌리고 contract를 지켜왔습니다——**그러나 「기본값으로 무엇을 넣는가」는 항상 owner의 decision이 아니었습니다**——다만 기본값 ON이었습니다.

v6.1.0은 이 구멍을 메웁니다: **install 자체가 decision이 되는** 것입니다. browser engine을 고르고, framework은 필요한 만큼만 materialize하며, 필요 없는 분은 일률로 쓰지 않습니다. writer는 전 client에서 일관되고, 바꾸고 싶으면 1개 command로 끝납니다. 이것이 「모두 여는 agent」와 「구한 것만 여는 agent」의 차이입니다.

## Reference materials

- install 시 question, `switch` command, BSK guide는 `scripts/lib/components/browser/`(`mcp-mode.mjs`, `switch.mjs`, `prompt.mjs`, `bsk-writer.mjs`)에 있습니다.
- `bsk-doctor` connectivity baseline과 전 test는 `scripts/tests/bsk-writer.test.mjs`(14 cases) + browser/mcp writer test에 있습니다.
- 완전한 release plan, scope, 그리고 6.1.0 version decision(minor → `6.1.0`)은 `docs/plans/release-6-1-0-browser-default-off-and-lighter-sessions.md`에 있습니다.
- Verification: 57 case target test가 통과합니다(wiring guard W1–W6은 추가 각 CLI command가 실제로 reach됨을 보증합니다). 실제 command `aios internal browser switch bsk`는 전 9개 client를 materialize하고 end-to-end로 guide를 냅니다.

> **Note:** 이 한국어판은 AI가 만든 초안입니다. 공개 전 한국어 화자의 확인을 권장합니다.

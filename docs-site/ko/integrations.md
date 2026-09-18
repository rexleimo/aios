---
title: 서드파티 통합(TypeSafe / Jev)
description: "커밋을 고정하고 해시를 검증하며 드라이런할 수 있는 하나의 명령으로 서드파티 에이전트 스킬과 MCP 서버를 도입합니다. 첫 지원 벤더는 TypeSafe(System One / Jev)이며 AIOS의 9개 클라이언트를 모두 지원합니다."
---

# 서드파티 통합(TypeSafe / Jev)

> **한 줄 답변:** `aios integration add <벤더>`는 고정된 커밋, 검증된 sha256, 클라이언트별 등록 계획, 실제 핸드셰이크 확인을 통해 서드파티 스킬과 그 MCP 서버를 설치합니다. 첫 지원 벤더는 **TypeSafe(System One / Jev)** 입니다. 먼저 `aios integration add typesafe --dry-run`을 실행해 디스크가 바뀌기 전에 클라이언트별 계획을 확인하세요.

## 통합 명령이 필요한 이유

대부분의 벤더는 도입 방법을 산문으로 안내합니다 — "이 프롬프트를 복사하세요 / 이 설정을 에이전트에 붙여넣으세요". 이것은 공급망 위험입니다. 그 텍스트에는 버전도 해시도 없고, 여러분의 실제 클라이언트 구성에 대해 검증되지도 않았습니다.

`aios integration`은 그 문장을 네 개의 하드 게이트를 갖춘 운영 명령으로 바꿉니다.

| 게이트 | 무엇을 증명하는가 |
| --- | --- |
| 커밋 고정 | 스킬이 움직이는 브랜치가 아니라 불변 리비전에서 가져온다 |
| sha256 검증 | 내용이 검토된 산출물과 일치한다. 변조되거나 오래된 사본은 거부된다 |
| 클라이언트별 계획 | AIOS의 9개 클라이언트 모두에 명시적이고 검사 가능한 등록 단계가 있다 |
| 실제 핸드셰이크 | 문서 MCP 서버에 실제로 도달하고 기대한 도구를 노출한다 |

## 지원 모델

AIOS는 벤더의 모델 정보를 통합 계약의 일부로 취급하므로 라우팅과 프롬프트에서 직접 지정할 수 있습니다.

| 벤더 | 모델 | 모델 ID | 자격 증명 | 문서 MCP |
| --- | --- | --- | --- | --- |
| TypeSafe(System One) | Jev | `jev-latest` | `TYPESAFE_API_KEY` | `https://docs.typesafe.ai/mcp` |

**TypeSafe System One**은 프로그래밍 프리미티브처럼 사용할 수 있는 작은 AI 지능 단위를 제공합니다: `Choice`, `Score`, `Noul`. **Jev**는 자연어와 애플리케이션 상태를 일반 코드가 조합할 수 있는 타입이 있는 판단과 확률로 바꾸어, "프롬프트 후 파싱" 단계를 구조화된 결정으로 전환합니다.

## TypeSafe 통합 설치

```bash
# 1. 9개 클라이언트의 모든 변경을 미리보기 — 아무것도 쓰지 않습니다
aios integration add typesafe --dry-run

# 2. 스킬을 설치하고 문서 MCP 서버를 등록
aios integration add typesafe

# 3. 성공 메시지가 아니라 실제 증거로 검증
aios integration doctor typesafe
```

드라이런은 클라이언트별 등록 단계를 출력하고 사람이 처리해야 할 부분을 표시합니다.

```text
TypeSafe integration: TypeSafe (System One / Jev) (typesafe) [dry-run]
  skill      planned @65a39f393687 sha256=71ea90d7906c
  claude     planned
             run: claude mcp add --scope user --transport http typesafe-docs https://docs.typesafe.ai/mcp
  codex      planned
             run: codex mcp add typesafe-docs --url https://docs.typesafe.ai/mcp
  gemini     manual step required  ~/.gemini/settings.json  (http-config-shape-unverified)
  probe      verified 2987ms
```

## 클라이언트 지원 범위

AIOS의 9개 클라이언트를 모두 지원합니다. 여기서 "지원"은 **모든 클라이언트에 정직하고 실행 가능한 다음 단계가 있다**는 뜻이며, 모든 클라이언트에 동일한 CLI가 있다는 주장이 아닙니다.

| 클라이언트 | 등록 방식 | AIOS 보고 |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http` | verified |
| Codex | `codex mcp add --url` | verified |
| OpenCode | `opencode mcp add --url` | verified |
| Grok | `grok mcp add -t http` | verified |
| Pi | `~/.pi/agent/mcp.json` 기록 | verified |
| Gemini CLI | CLI가 있으면 `--transport http`, 없으면 설정 파일 + 수동 단계 | verified 또는 수동 단계 |
| Hermes | `hermes mcp add --url` | 대화형 터미널 필요 |
| WorkBuddy | 설정 파일 + 수동 단계 | 수동 단계 필요 |
| ZCode | 설정 파일 + 수동 단계 | 수동 단계 필요 |

두 가지 동작은 의도된 것입니다.

- **Hermes**는 인증 방식을 대화형으로 묻고 비대화형 플래그가 없습니다. AIOS는 답을 추측하지도, 스크립트를 멈춰 세우지도 않고 정확한 명령을 출력하며 `pending-interactive`로 보고합니다.
- **WorkBuddy와 ZCode**는 설정 파일 위치는 알려져 있지만 AIOS가 검증한 HTTP transport 키 이름은 없습니다. AIOS는 파일과 JSON 골격을 보여주고 알 수 없는 키를 `<transport-key>`로 남겨 둡니다. 필드 이름을 지어내지 않습니다.

클라이언트가 설치되지 않은 경우 바이너리 이름과 함께 `client-missing`으로 보고되며, 조용히 성공으로 처리되지 않습니다.

## 명령

| 명령 | 용도 |
| --- | --- |
| `aios integration list` | 알려진 벤더와 설치 내용을 나열 |
| `aios integration add <벤더> [--dry-run] [--clients a,b] [--skip-skills] [--skip-mcp]` | 스킬을 설치하고 MCP 서버를 등록 |
| `aios integration doctor <벤더> [--json]` | 스킬 해시, 클라이언트 등록, 자격 증명 존재 여부, 실시간 MCP 핸드셰이크를 검증 |
| `aios integration remove <벤더> [--dry-run]` | AIOS가 소유한 것만 해제하고 제거 |

주요 플래그:

- `--dry-run`은 전체 계획을 출력하고 아무것도 쓰지 않습니다.
- `--clients claude,codex`는 특정 클라이언트로 제한합니다. 기본값은 9개 전부입니다.
- `--skip-skills` 또는 `--skip-mcp`는 한쪽 계층만 필요할 때 분리 실행합니다.
- `doctor`의 `--json`은 CI용 기계 판독 가능 증거를 출력합니다.

## 스킬 계층이 설치하는 것

스킬은 AIOS 카탈로그(`skill-sources/`)에 들어간 뒤 기존 스킬 배포기로 모든 클라이언트에 퍼집니다. AIOS 자체 스킬과 동일한 경로이므로 서드파티 스킬과 내장 스킬이 어긋나지 않습니다.

AIOS는 카탈로그 사본에 내부 frontmatter 키를 추가해 배포 대상을 판단하고, 클라이언트 스킬 트리에 쓰기 전에 그 키들을 제거합니다. 클라이언트는 벤더의 `name`, `description`, `license`만 봅니다.

AIOS가 소유하지 않은 같은 이름의 카탈로그 디렉터리는 절대 덮어쓰지 않습니다. `skill-sources/typesafe-ai`에 직접 수정한 내용이 있으면 설치가 `unmanaged-existing-catalog-directory`로 거부하고 확인할 위치를 알려줍니다.

## 안전 속성

- **자격 증명은 존재 여부만 확인합니다.** doctor는 `TYPESAFE_API_KEY`가 설정되었는지만 보고하며 값을 읽거나 출력하거나 저장하지 않습니다.
- **소유권을 기록합니다.** `~/.aios/integrations/<벤더>.json`이 AIOS가 쓴 각 항목의 지문을 보관하므로 이후 실행에서 `owned` / `external` / `conflict`를 구분하고 직접 추가한 항목을 덮어쓰지 않습니다.
- **제거 범위가 한정됩니다.** `aios integration remove`는 AIOS가 등록한 항목만 해제하며 같은 파일의 다른 MCP 서버는 보존합니다.
- **편집 전 백업.** 설정 파일은 다시 쓰기 전에 `.bak-<타임스탬프>`로 백업됩니다.

## 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `manual step required` | 해당 클라이언트의 HTTP 설정 형태가 미검증 | 출력된 파일을 열고 클라이언트 문서에서 transport 키 이름 확인 |
| `needs a terminal` | 클라이언트의 `mcp add`가 대화형으로 질문 | 출력된 명령을 실제 터미널에서 직접 실행 |
| `client not installed` | 클라이언트 바이너리가 `PATH`에 없음 | 클라이언트를 설치한 뒤 다시 실행 |
| `probe unreachable` | 문서 MCP 엔드포인트가 핸드셰이크를 완료하지 못함 | 네트워크나 프록시 설정 확인 후 `doctor` 재실행 |
| `unmanaged-existing-catalog-directory` | `skill-sources/<이름>`이 AIOS 소유가 아님 | 직접 수정한 내용을 옮긴 뒤 설치 재실행 |

## 다음 단계

- [모델 라우터](model-router.md) — `task-type`을 선언하고 특정 모델 면으로 라우팅합니다.
- [ContextDB](contextdb.md) — 통합 스킬이 참조하는 프로젝트 메모리.
- [워크플로 정책](workflow-policy.md) — direct / guarded / planned 판단 방식.

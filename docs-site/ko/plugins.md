---
title: AIOS 플러그인——GitHub 설치, 작성, 기여
description: "AIOS 플러그인을 GitHub에서 한 명령으로 설치하고 수명 주기를 관리하며 manifest를 작성하고 신뢰 경계를 이해한 뒤 Pull Request로 커뮤니티에 기여하는 방법."
---

# AIOS 플러그인——GitHub 설치, 작성, 기여

> **한 줄 답:** 프로젝트 루트에서 `aios plugin install github:owner/repo#v1.2.3` 을 실행하세요. AIOS가 공개 저장소를 `.aios/plugins/<id>` 로 clone하고 루트 `manifest.json` 을 검증한 뒤 해석된 commit에 고정하여 `config/plugins.json` 에 등록합니다. `aios plugin add` 는 별칭입니다.

## 플러그인이 추가할 수 있는 것

AIOS 플러그인은 루트에 `manifest.json` 을 둔 디렉터리입니다. `contributes` 로 다음을 추가할 수 있습니다:

| contribution | 추가 기능 |
| --- | --- |
| `panels` | Console 탐색 페이지. 단일 HTML sandbox UI 선택 가능 |
| `integrations` | 기존 통합 레지스트리를 통한 skill/MCP 통합 |
| `providers` | 별도 자식 프로세스가 stdio JSON-RPC로 읽는 모델/공급자 데이터 |
| `middleware` | 제한된 Node VM에서 실행되는 게이트웨이 요청 훅 |
| `clients` | 기존 connect 시스템을 재사용하는 클라이언트 연결 선언 |
| `actions` | 선언형 작업/도구 |
| `onUsage` | 게이트웨이 사용량 집계 |

## GitHub에서 설치

### 전제 조건

- 확장할 **프로젝트 루트**에서 실행합니다.
- Git이 `PATH` 에 있어야 합니다.
- 저장소는 공개여야 하고 루트에 `manifest.json` 이 있어야 합니다.
- 바로 로드할 수 있는 파일을 함께 제공하세요. AIOS는 `build`, `prepare`, `install` 등 패키지 스크립트를 **실행하지 않습니다**.

### 한 명령 설치

```bash
# 기본 브랜치. 설치 시 해석하여 고정
aios plugin install github:acme/demo

# tag, 브랜치 또는 전체 commit SHA
aios plugin install github:acme/demo#v1.2.3
aios plugin install --ref main github:acme/demo

# DSH 스타일 별칭
aios plugin add github:acme/demo#v1.2.3

# 일반 GitHub HTTPS URL도 지원
aios plugin install https://github.com/acme/demo
```

JSON 결과에는 플러그인 id, 정규화된 source, 해석된 commit, manifest 경로, 적용된 contribution이 나옵니다:

```json
{
  "ok": true,
  "id": "demo-plugin",
  "source": "github:acme/demo#v1.2.3",
  "commit": "1111111111111111111111111111111111111111",
  "manifest": ".aios/plugins/demo-plugin"
}
```

checkout은 detached HEAD로 고정됩니다. 나중에 브랜치나 tag에 push해도 설치된 파일은 조용히 바뀌지 않습니다.

### 로컬 플러그인 설치

기존 로컬 방식도 계속 지원합니다:

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

플러그인 개발과 AIOS 저장소의 하위 디렉터리에 manifest가 있는 `examples/hello-plugin` 에 적합합니다.

## 설치된 플러그인 관리

| 명령 | 용도 |
| --- | --- |
| `aios plugin list --json` | 등록된 플러그인과 manifest 경로 표시 |
| `aios plugin disable <id>` | 설치는 유지하고 contribution 철회 |
| `aios plugin enable <id>` | contribution 재적용 |
| `aios plugin remove <id>` | 등록 해제 및 투영 철회 |
| `aios plugin providers --json` | 내장/플러그인 provider 조회 |
| `aios plugin models --json` | 내장/플러그인 모델 조회 |

GitHub 설치 쓰기 위치:

```text
<project>/
├── config/plugins.json                 # 수명 주기 레지스트리
└── .aios/plugins/<plugin-id>/          # commit 고정 checkout
```

`remove` 는 소스 디렉터리를 삭제하지 않습니다. 깨끗하게 재설치하려면 remove 후 `.aios/plugins/<plugin-id>` 를 삭제하고 다시 설치하세요.

## 플러그인 작성

### 최소 manifest

```json
{
  "schemaVersion": 1,
  "id": "demo-plugin",
  "version": "1.0.0",
  "permissions": ["panel"],
  "lifecycle": {
    "install": "automatic",
    "upgrade": "manual",
    "disable": "toggle",
    "remove": "clean"
  },
  "contributes": {
    "panels": [
      {
        "id": "demo",
        "href": "/demo",
        "label": "Demo",
        "title": "Demo plugin",
        "ui": { "entry": "panel.html" }
      }
    ]
  }
}
```

규칙:

- `id` 는 소문자이며 `^[a-z][a-z0-9._-]*$` 를 만족합니다.
- `version` 은 `1.2.3` 또는 `1.2.3-beta.1` 같은 SemVer 형식입니다.
- `ui.entry` 는 플러그인 내부의 상대 `.html` 경로이며 최대 256 KiB입니다.
- provider `entry` 는 플러그인 디렉터리 기준 상대 경로입니다.
- integration 선언은 기존 pinned-commit 및 sha256 검증을 통과해야 합니다.

### 실행 모델과 신뢰 경계

| surface | 실행 모델 | 신뢰 참고 |
| --- | --- | --- |
| manifest 및 panel 데이터 | 호스트가 읽어 투영 | 외부 설치 스크립트 실행 안 함 |
| Panel HTML | `iframe sandbox="allow-scripts"` | 호스트 DOM, Cookie, API에 same-origin 접근 불가 |
| Middleware | 제한된 Node VM, timeout, clone/rollback, fail-open | 강력한 격리는 아니므로 신뢰하는 훅만 설치 |
| Provider entry | 별도 Node 자식 프로세스, stdio JSON-RPC | 호스트와 같은 OS 권한으로 플러그인 코드 실행 |

설치는 신뢰 결정입니다. tag 또는 전체 commit SHA를 사용하고 `permissions`, `contributes`, provider/middleware 코드를 검토하세요.

## Pull Request로 기여

중앙 마켓플레이스는 아직 없지만 커뮤니티 플러그인 PR은 환영합니다.

1. 루트 `manifest.json`, README, 라이선스를 갖춘 저장소를 공개합니다.
2. release tag를 붙이고 로컬/GitHub 설치를 모두 검증합니다.
3. 아래 표에 다음을 담은 행을 추가하는 PR을 엽니다:
   - 플러그인 이름과 저장소 URL;
   - 검증한 tag 또는 commit;
   - 한 문장 용도;
   - 필요한 권한;
   - 설치/테스트 증거.
4. 플러그인은 계속 GitHub에서 직접 설치합니다. 목록 PR이 코드를 AIOS 저장소로 옮기지는 않습니다.

[플러그인 가이드 편집 페이지](https://github.com/rexleimo/aios/edit/main/docs-site/ko/plugins.md)에서 시작하거나 [issue](https://github.com/rexleimo/aios/issues) 를 여세요.

### 커뮤니티 플러그인

| 플러그인 | source | install |
| --- | --- | --- |
| 공식 `hello-plugin` 예제 | [AIOS repository](https://github.com/rexleimo/aios/tree/main/examples/hello-plugin) | AIOS checkout에서 `aios plugin install --id hello-plugin --dir examples/hello-plugin` |
| 여러분의 플러그인 | PR welcome | `aios plugin install github:owner/repo#tag` |

## 문제 해결

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| `GitHub source must name owner/repo` | 잘못된 축약 또는 URL 경로 | `github:owner/repo` 또는 `https://github.com/owner/repo` 사용 |
| `git clone failed` | Git 없음, 네트워크/프록시, 비공개 저장소 | Git 설치, 연결 확인, 공개 저장소 사용 |
| `plugin manifest ... is not valid JSON or missing` | 루트에 `manifest.json` 없음 | 루트에 유효한 manifest 추가 |
| `manifest id ... != requested ...` | `--id` 불일치 | `--id` 생략 또는 manifest id 사용 |
| `plugin target already exists` | 이전 checkout 잔존 | remove 후 `.aios/plugins/<id>` 삭제하고 재설치 |
| `plugin ... already installed` | 이미 등록된 id | 비활성화하거나 remove 후 재설치 |
| TypeScript 플러그인이 로드되지 않음 | Git 설치는 빌드하지 않음 | 로드 가능한 JS를 commit하거나 빌드된 파일 배포 |

## 현재 제한

- 공개 GitHub HTTPS 저장소만 지원. SSH, 비공개, npm 패키지, 내장 인증 정보는 미지원.
- 자동 업데이트, 마켓 검색, 서명 레지스트리는 아직 없습니다.
- manifest는 저장소 루트에 있어야 합니다.
- AIOS는 저장소 빌드 스크립트를 허용하거나 실행하지 않습니다.

## 다음 단계

- [릴리스 블로그: GitHub 플러그인 한 명령 설치](https://cli.rexai.top/blog/ko/2026-11-plugin-ecosystem/)
- [서드파티 통합](integrations.md)——고정 버전 skill/MCP 관리.
- [Model Router](model-router.md)——모델 공급자 간 라우팅.
- [Architecture](architecture.md)——AIOS 런타임에서 플러그인의 위치.

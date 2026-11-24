---
title: "v8.2.0: AIOS 플러그인을 GitHub에서 한 명령으로 설치할 수 있게 되다"
description: "AIOS 플러그인은 Console 페이지, 통합, 공급자, middleware, 클라이언트 연결, 작업, 사용량 집계를 추가합니다. GitHub에서 바로 설치하고 commit에 고정하며 저장소 빌드 스크립트는 실행하지 않습니다."
date: 2026-11-24
tags: ["AIOS", "v8.2.0", "플러그인", "GitHub", "생태계", "릴리스"]
---

# v8.2.0: AIOS 플러그인을 GitHub에서 한 명령으로 설치할 수 있게 되다

플러그인 시스템은 런타임을 먼저 출시했지만 정문이 없었습니다. manifest를 읽고
app 전역에 contribution을 투영할 수 있었지만 사용자에게는 가이드도, GitHub
한 줄 설치도, 플러그인 제출 경로도 없었습니다. 이제 그 공백을 채웁니다.

## 설치

프로젝트 루트에서 실행하세요:

```bash
aios plugin install github:owner/repo#v1.2.3
```

전체 GitHub HTTPS URL도 지원하며 `add` 는 별칭입니다:

```bash
aios plugin add github:owner/repo#v1.2.3
aios plugin install https://github.com/owner/repo
```

AIOS는 공개 저장소를 `.aios/plugins/<id>` 로 clone하고 루트 `manifest.json` 을
검증합니다. tag, 브랜치, SHA는 commit으로 해석되어 detached HEAD로 고정된 뒤
`config/plugins.json` 에 등록됩니다.

## 플러그인이 추가하는 것

하나의 manifest로 다음을 추가할 수 있습니다:

- sandbox 처리된 단일 HTML UI를 포함한 Console 페이지;
- 기존 고정 버전 통합 레지스트리를 통한 skill/MCP 통합;
- 별도 자식 프로세스가 읽는 모델/공급자 데이터;
- 경계와 timeout을 가진 게이트웨이 middleware;
- 클라이언트 연결, 작업, 사용량 집계.

기존 로컬 개발 방식도 계속 쓸 수 있습니다:

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

## 안전 경계

Git 설치 중 AIOS는 저장소의 `build`, `prepare`, `install` 등 패키지 스크립트를
**실행하지 않습니다**. 작성자는 바로 로드할 수 있는 파일을 제공해야 합니다.
checkout은 commit에 고정되므로 이후 push가 검토한 코드를 조용히 바꾸지 않습니다.

그래도 설치는 신뢰 결정입니다. Panel HTML은 sandbox iframe에서, middleware는
timeout과 rollback이 있는 제한 VM에서, provider entry는 호스트와 같은 OS 권한을
가진 별도 자식 프로세스에서 실행됩니다. `permissions` 와 `contributes` 를
검토하고 release tag 또는 전체 commit SHA를 우선하세요.

현재 제한도 분명합니다. 공개 GitHub HTTPS 저장소만 지원하며 manifest는 루트에
있어야 합니다. 자동 업데이트, 마켓 검색, npm/SSH 설치는 아직 없습니다.

## 작성과 기여

새 [플러그인 가이드](https://cli.rexai.top/ko/plugins/)에는 manifest 계약,
수명 주기 명령, 실행 경계, 문제 해결, Pull Request 기여 절차가 있습니다.

커뮤니티 플러그인 기여 절차:

1. 루트 `manifest.json`, README, 라이선스를 갖춘 저장소를 공개;
2. release tag를 붙이고 로컬/GitHub 설치를 모두 검증;
3. 저장소, 검증한 tag/commit, 용도, 권한, 증거를 표에 추가하는 PR 생성.

코드는 여러분 저장소에 남습니다. PR는 발견 가능한 목록과 다른 개발자가 복사할
수 있는 설치 명령을 추가합니다.

## 검증

집중 설치 테스트 9/9 통과. 실제 Windows CLI 스모크 테스트는 GitHub 형태 source로
임시 Git 저장소에서 설치하여 해석된 commit, detached checkout, 레지스트리,
panel 투영, staging 정리를 확인했습니다. 독립 기준/명세 검토는 대상 diff에서
발견 0건이었습니다.

[작성·기여 가이드](https://cli.rexai.top/ko/plugins/)를 읽고 AIOS에 부족했던 확장을
보내주세요.

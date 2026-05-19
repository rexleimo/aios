---
title: 공식 사례 라이브러리
description: Harness CLI로 실제로 무엇을 할 수 있는지 재현 가능한 명령 기준으로 정리.
---

# 공식 사례 라이브러리

이 페이지는 `Harness CLI`의 능력 맵입니다.

각 사례는 다음을 포함합니다:

- `언제 사용하는가`: 의사결정 트리거
- `실행`: 복사粘贴 가능한 명령
- `증거`: 성공을 증명하는 것

## 추천 딥다이브

[GitHub에서 Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_library_featured_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="github_star" }
[워크플로 비교](cli-comparison.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="compare_workflows" }
[케이스: 크로스 CLI 핸드오프](case-cross-cli-handoff.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_handoff" }
[케이스: 브라우저 인증벽 플로우](case-auth-wall-browser.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_authwall" }
[케이스: Privacy Guard 설정 읽기](case-privacy-guard.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_privacy" }

## 사례 1: 신규 환경 5분 초기 설정

**언제 사용하는가**

새 노트북이나 팀원을 온보딩하고 빠르게 깨끗한 베이스라인이 필요한 경우.

**실행**

```bash
scripts/setup-all.sh --components all --mode opt-in
scripts/verify-aios.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-all.ps1 -Components all -Mode opt-in
powershell -ExecutionPolicy Bypass -File .\scripts\verify-aios.ps1
```

**증거**

- `verify-aios`이 종료 코드 `0`으로 종료
- `doctor-*` 체크에 블로킹 오류 없음

## 사례 2: Browser MCP 설치와 스모크 테스트

**언제 사용하는가**

데모나 agent 워크플로에 브라우저 자동화(`browser_*`)가 필요한 경우.

**실행**

```bash
scripts/install-browser-mcp.sh
scripts/doctor-browser-mcp.sh
```

클라이언트 채팅에서 실행:

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://example.com"}
browser_snapshot {"includeAx":true}
browser_close {}
```

**증거**

- `doctor-browser-mcp`가 `Result: OK`를 보고(경고는 허용 가능)
- 스모크 명령이 구조화된 도구 응답을 반환하고 런타임 예외 없음

## 사례 3: 크로스 CLI 핸드오프

**언제 사용하는가**

Claude에게 분석시키고, Codex에게 구현시키고, Gemini에게 검토하게 하고 싶지만 컨텍스트를 잃고 싶지 않은 경우.

**실행**

```bash
claude
codex
gemini
```

또는 결정적 one-shot:

```bash
scripts/ctx-agent.sh --agent claude-code --prompt "障碍을 요약하고 다음 스텝을 제안"
scripts/ctx-agent.sh --agent codex-cli --prompt "최신 checkpoint에서 최우선 수정 구현"
scripts/ctx-agent.sh --agent gemini-cli --prompt "회귀 위험과 누락된 테스트 검토"
```

**증거**

- `.aios/context-db/`에 새로운 session/checkpoint 아티팩트
- 이후 CLI 실행이 같은 프로젝트 컨텍스트를 사용하여 계속 가능

## 사례 4: 인증벽 처리 (인간 개입)

**언제 사용하는가**

자동화가 로그인벽(Google, Meta, 플랫폼 인증)에 도달하고 맹목적으로 바이패스해서는 안 되는 경우.

**실행**

```text
browser_launch {"profile":"local"}
browser_navigate {"url":"https://target.site"}
browser_auth_check {}
```

`requiresHumanAction=true`이면 같은 브라우저 profile에서 수동 로그인을 완료하고 `browser_snapshot` / `browser_click` / `browser_type`으로 계속.

**증거**

- `browser_auth_check`가 명확한 인증 상태 필드를 반환
- 수동 로그인 후 같은 profile로 플로우 재개

## 사례 5: One-shot 감사 가능한 실행 체인

**언제 사용하는가**

감사 가능한 레코드(`init -> session -> event -> checkpoint -> pack`)를 단일 명령으로 생성해야 하는 경우.

**실행**

```bash
scripts/ctx-agent.sh --agent codex-cli --project Harness CLI --prompt "최신 checkpoint에서 다음 작업 실행"
```

**증거**

- `.aios/context-db/index/checkpoints.jsonl`에 새 checkpoint 항목
- `.aios/context-db/exports/`에 내보내기된 context packet

## 사례 6: Skills 라이프사이클 운영

**언제 사용하는가**

여러 CLI에서 공유 skills를 관리하고 예측 가능한 라이프사이클 작업이 필요한 경우.

**실행**

```bash
scripts/install-contextdb-skills.sh
scripts/doctor-contextdb-skills.sh
scripts/update-contextdb-skills.sh
# 롤백이 필요한 경우
scripts/uninstall-contextdb-skills.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-skills.ps1
# 롤백이 필요한 경우
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-skills.ps1
```

**증거**

- Doctor 출력이 대상이 존재하고 건강한지 확인
- 업데이트/제거 시 단절된 링크 없음

## 사례 7: Shell 래퍼 복구와 롤백

**언제 사용하는가**

사용자가 명령 래핑 문제를 보고하고 안전한 복구 경로가 필요한 경우.

**실행**

```bash
scripts/doctor-contextdb-shell.sh
scripts/update-contextdb-shell.sh
# 완전한 롤백이 필요한 경우
scripts/uninstall-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-shell.ps1
# 완전한 롤백이 필요한 경우
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-shell.ps1
```

**증거**

- Wrapper doctor가 더 이상 블로킹 문제를 보고하지 않음
- 롤백 후 네이티브 `codex`/`claude`/`gemini` 명령이 정상 동작

## 사례 8: 릴리스 전 보안 헬스 체크

**언제 사용하는가**

업데이트를 게시하기 전에 skills/hooks/MCP 설정에서 안전하지 않은 설정 드리프트가 없는지 확인.

**실행**

```bash
scripts/doctor-security-config.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-security-config.ps1
```

**증거**

- Security doctor가 `0`으로 종료
- 모든 경고가 릴리스 전에 검토되고 해결됨

## 신규 공식 사례投稿

이 라이브러리에 사례를 제안하려면:

1. 플레이스홀더 없이 정확한 명령을 포함하세요.
2. 측정 가능한 증거를 정의하세요(종료 코드, 파일 아티팩트 또는 도구 응답).
3. 관련 시 롤백/복구 단계를 추가하세요.

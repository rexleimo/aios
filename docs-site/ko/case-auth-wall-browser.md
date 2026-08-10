---
title: 케이스 - 브라우저 인증벽 플로우
description: challenge/인증벽을 감지하고 human-in-the-loop handoff로 안전하게 계속 진행.
---

# 케이스: 브라우저 인증벽 플로우

[GitHub에서 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="github_star" }
[워크플로 비교](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="compare_workflows" }
[케이스 집합](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_authwall_hero" data-rex-target="case_library" }

## 언제 사용하는가

브라우저 자동화가 로그인벽, Cloudflare 체크 또는 challenge 페이지에 도달했을 때 사용합니다.

## 실행

실행하고 탐색:

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://target.site"}
```

벽 상태 확인:

```text
browser_auth_check {"profile":"default"}
browser_challenge_check {"profile":"default"}
```

인간 조치가 필요하면, 같은 profile에서 수동으로 로그인/challenge를 완료한 후 계속:

```text
browser_snapshot {"profile":"default","includeAx":true}
```

## 증거

1. 도구 출력이 벽 상태를 명확히 나타냅니다 (`requiresHumanAction`, challenge/인증 힌트).
2. 수동 완료 후 `browser_snapshot`이 로그인 후 페이지에서 성공합니다.
3. 자동화가 우회를 시도하지 않습니다.

## 왜 중요한가

신뢰할 수 있는 자동화는 맹목적 자동화가 아닙니다.
이 플로우는 정책 관련 단계를 명시적으로 human-gated로 유지한 다음 공유 브라우저 상태로 재개합니다.

[Star on GitHub](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_authwall_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_authwall_footer" data-rex-target="github_star" }

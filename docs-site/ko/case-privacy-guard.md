---
title: 케이스 - Privacy Guard 설정 읽기
description: 모델 소비 전 리덕션을 통해 설정样 파일을 안전하게 읽기.
---

# 케이스: Privacy Guard 설정 읽기

[GitHub에서 Star](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_privacy_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="github_star" }
[워크플로 비교](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="compare_workflows" }
[케이스 집합](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_privacy_hero" data-rex-target="case_library" }

## 언제 사용하는가

키, 토큰, 쿠키 또는 session样 데이터가 포함될 수 있는 설정 파일을 공유하기 전에 사용합니다.

## 실행

상태 확인:

```bash
aios privacy status
```

리덕션 경로를 통해 민감 파일 읽기:

```bash
aios privacy read --file config/browser-profiles.json
```

선택적 로컬 모델 강화:

```bash
aios privacy ollama-on
```

## 증거

1. 출력이 리덕션되어 원시 시크릿을 노출하지 않습니다.
2. 설정 의도가 문제 해결/리뷰용으로 계속 읽을 수 있습니다.
3. `privacy status`가 엄격 모드가 활성화되었음을 확인합니다.

## 왜 중요한가

팀은 종종 원시 설정을 프롬프트에 붙여넣어 시크릿을 유출합니다.
Privacy Guard는 위험한 읽기를 재현 가능한 안전한 기본값으로 전환합니다.

[Star on GitHub](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_privacy_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_privacy_footer" data-rex-target="github_star" }

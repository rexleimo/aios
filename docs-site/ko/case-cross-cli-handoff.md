---
title: 케이스 - 크로스 CLI 핸드오프
description: 공유 ContextDB로 Claude 분석, Codex 구현, Gemini 리뷰의 재현 가능한 플로우.
---

# 케이스: 크로스 CLI 핸드오프

[GitHub에서 Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="github_star" }
[워크플로 비교](cli-comparison.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="compare_workflows" }
[케이스 집합](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="case_handoff_hero" data-rex-target="case_library" }

## 언제 사용하는가

한 모델은 분석하고, 다른 하나는 구현하고, 또 다른 하나는 컨텍스트를 잃지 않고 리뷰해야 할 때 사용합니다.

## 실행

```bash
scripts/ctx-agent.sh --agent claude-code --project Harness CLI --prompt "障碍을 분석하고 주요 수정안을 제안하세요."
scripts/ctx-agent.sh --agent codex-cli --project Harness CLI --prompt "최신 checkpoint에서 주요 수정을 구현하세요."
scripts/ctx-agent.sh --agent gemini-cli --project Harness CLI --prompt "회귀 위험과 누락된 테스트를 리뷰하세요."
```

## 증거

1. 공유 session/checkpoints가 다음에서 업데이트됩니다:

```bash
ls .aios/context-db/sessions
```

2. 타임라인이 크로스 agent 연속성을 보여줍니다:

```bash
cd mcp-server
npm run -s contextdb -- timeline --project Harness CLI --limit 12
```

3. 최신 session의 내보내기된 context packet이 존재합니다:

```bash
ls .aios/context-db/exports | tail -n 5
```

## 왜 중요한가

공유 레이어 없이는 크로스 agent 핸드오프가 종종 복사/붙여넣기 컨텍스트로 퇴보합니다.
Harness CLI에서는 모든 agent가 동일한 프로젝트 컨텍스트 경로와 checkpoint 스트림을 읽고 씁니다.

[Star on GitHub](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_handoff_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_handoff_footer" data-rex-target="github_star" }

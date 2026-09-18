---
title: "v1.52.0: Deterministic Shell Output Compression via MCP"
description: "AIOS v1.52.0은 모든 AIOS 클라이언트에 결정적 shell 출력 압축을 제공하는 MCP 도구 aios_shell을 도입하고 shim 자가 복구와 위험 명령 가드를 추가했습니다. 글에서는 압축 효과, 지원 범위, 보안 정책, 업그레이드 시 주의점을 설명합니다."
date: 2026-06-11
tags: ["release", "token-compression", "shell", "MCP", "multi-client", "shim"]
---

# v1.52.0: Deterministic Shell Output Compression via MCP

v1.52.0은 `aios_shell` MCP tool 을 추가해 shell command output 을 MCP proxy 를 통해 compact packet 으로 압축합니다.

## Highlights

- `aios-shell` MCP alias 를 client configs 에 등록
- MCP proxy 가 raw shell output 을 ref 로 offload 하고 agent context 에는 compact packet 을 반환
- native shim self-healing fallback 추가
- `git push` 와 `npm publish` 를 sensitive command guard 대상으로 추가

전체 구현 노트는 영어 릴리스 글을 참고하세요: [v1.52.0 shell compression](../2026-06-v152-aios-shell-mcp.md).

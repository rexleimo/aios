---
title: "v1.52.0: Deterministic Shell Output Compression via MCP"
description: "AIOS v1.52.0 introduces aios_shell for deterministic shell output compression across AIOS clients."
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

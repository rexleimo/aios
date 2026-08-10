---
title: "Grok Build가 AIOS 1급 클라이언트가 되었습니다"
description: "AIOS가 xAI Grok Build를 skills/agents/native/team/harness 지원 1급 AIOS 클라이언트로 등록합니다. runtime id는 grok-build입니다."
date: 2026-07-09
tags: ["Grok Build", "AIOS", "MCP", "client", "Skills", "xAI"]
---

# Grok Build가 AIOS 1급 클라이언트가 되었습니다

xAI **Grok Build**(`grok` CLI)가 Codex CLI, Claude Code, Gemini CLI, OpenCode, Hermes Agent와 함께 AIOS의 1급 AIOS 클라이언트로 등록되었습니다.

설정 한 줄 추가가 아니라 native sync, skills 설치, codemap MCP 주입, `ctx-agent`, solo harness / team provider를 구동하는 client registry에 정식 연결됩니다.

## 등록 요약

| 항목 | 값 |
|------|-----|
| clientId | `grok` |
| runtimeClientId | `grok-build` |
| capabilities | skills, agents, superpowers, native, team, harness |
| skills | `.grok/skills` |
| agents | `.grok/agents` |
| instructions | `AGENTS.md` (공유) |
| MCP | `~/.grok/config.toml` / `.grok/config.toml` (TOML `mcp_servers`) |
| unattended | `--always-approve` |

## 사용 방법

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
node scripts/aios.mjs init --agent grok
node scripts/ctx-agent.mjs --agent grok-build --workspace .
node scripts/aios.mjs harness run --objective "long task" --provider grok --worktree
```

## 관련 링크

- [Changelog v3.4.0](https://cli.rexai.top/ko/changelog/)
- [Quick Start](https://cli.rexai.top/ko/getting-started/)

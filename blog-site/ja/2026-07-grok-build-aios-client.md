---
title: "Grok Build が AIOS のファーストクラスクライアントに"
description: "Harness CLI が xAI Grok Build を skills / agents / native / team / harness 付きのファーストクラス AIOS クライアントとして登録。runtime id は grok-build。"
date: 2026-07-09
tags: ["Grok Build", "AIOS", "MCP", "client", "Skills", "xAI"]
---

# Grok Build が AIOS のファーストクラスクライアントに

xAI の **Grok Build**（`grok` CLI）が、Codex CLI・Claude Code・Gemini CLI・OpenCode・Hermes Agent と並び、Harness CLI のファーストクラス AIOS クライアントになりました。

単なる設定追記ではなく、native sync、skills インストール、codemap MCP 注入、`ctx-agent`、solo harness / team provider を駆動する client registry に正式登録されています。

## 登録サマリ

| 項目 | 値 |
|------|-----|
| clientId | `grok` |
| runtimeClientId | `grok-build` |
| capabilities | skills, agents, superpowers, native, team, harness |
| skills | `.grok/skills` |
| agents | `.grok/agents` |
| instructions | `AGENTS.md`（共有） |
| MCP | `~/.grok/config.toml` / `.grok/config.toml`（TOML `mcp_servers`） |
| unattended | `--always-approve` |

## 使い方

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
node scripts/aios.mjs init --agent grok
node scripts/ctx-agent.mjs --agent grok-build --workspace .
node scripts/aios.mjs harness run --objective "long task" --provider grok --worktree
```

## 関連

- [Changelog v3.4.0](https://cli.rexai.top/ja/changelog/)
- [Quick Start](https://cli.rexai.top/ja/getting-started/)

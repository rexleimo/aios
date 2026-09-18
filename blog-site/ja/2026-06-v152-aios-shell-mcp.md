---
title: "v1.52.0: Deterministic Shell Output Compression via MCP"
description: "AIOS v1.52.0 はすべての AIOS クライアントに決定論的な shell 出力圧縮を提供する MCP ツール aios_shell を導入し、shim の自己修復と危険コマンドのガードも追加しました。記事では圧縮効果、対応範囲、安全方針、アップグレード時の注意を説明します。"
date: 2026-06-11
tags: ["release", "token-compression", "shell", "MCP", "multi-client", "shim"]
---

# v1.52.0: Deterministic Shell Output Compression via MCP

v1.52.0 は `aios_shell` MCP tool を追加し、shell command output を MCP proxy 経由で compact packet に圧縮します。

## Highlights

- `aios-shell` MCP alias を client configs に登録
- MCP proxy が raw shell output を ref に offload し、agent context には compact packet を返却
- native shim の self-healing fallback を追加
- `git push` と `npm publish` を sensitive command guard の対象に追加

See the English release article for the full implementation notes: [v1.52.0 shell compression](../2026-06-v152-aios-shell-mcp.md).

---
name: aios-offload-recall
description: Use when recalling prior AIOS tool/browser outputs from offloaded refs; inspect Mermaid canvas first, then read only matching node-level evidence.
---

# AIOS Offload Recall

Use this when prior tool output is likely stored under `.aios/offload/` and token use matters.

## Recall Order

1. Identify the session id from ContextDB, harness status, or the user's handoff.
2. Run `node scripts/aios.mjs canvas show --session <id>` to inspect the compact task graph.
3. Search narrowly with `node scripts/aios.mjs refs grep "<pattern>" --session <id>`.
4. Read only the needed node with `node scripts/aios.mjs refs read <node_id>`.
5. Summarize the recalled evidence and keep the `node_id` in your notes.

## Backfill Existing Logs

If a previous run produced JSONL tool-event logs but no canvas yet, create the index first:

```bash
node scripts/aios.mjs canvas backfill --input <events.jsonl> --client <client> --session <id>
```

Then resume the recall order above. Backfill accepts generic records with fields like `tool`, `input`, `output`,
or Claude-style `tool_name`, `tool_input`, `tool_response`.

## Rules

- Do not load every ref file unless the user explicitly asks for a full audit.
- Do not treat the canvas as complete evidence; it is an index over raw refs.
- If a node may contain secrets, use `aios privacy read --file <path>` before sharing content.
- Savings are future-context savings: canvas/node_id replaces raw log replay during resume or recall.

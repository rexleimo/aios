---
name: memo
description: "AIOS project memory — read/write/search your own memory using the memo capabilities. You (the model) decide what to remember, what to correct, and what was useful; the harness only executes your decision. Use when you want to recall prior work, persist a durable fact, supersede a wrong one, or mark a recalled memory useful. TRIGGER: 记忆、memory、memo、remember、recall、记住、之前、结论"

installCatalogName: memo
clients: [codex, claude, hermes, workbuddy]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, memory, memo]
repoTargets: [codex, claude, gemini, opencode, hermes, agents, workbuddy]
---

# AIOS Memory (memo)

Working directory: project root. Memory commands run from the repo root.

## Principle: you decide, the harness executes

The harness only *provides capabilities* and does **not** judge semantics for you.
Judging **whether a fact is durable**, **what to persist**, **what to correct**, and
**which recalled memory was useful** is entirely your job. The harness parses your
declaration and executes it — it never guesses for you.

## Capabilities you can invoke

Run from the repo root with `node scripts/aios.mjs memo ...`:

- **Recall** what you already know before continuing work:
  `node scripts/aios.mjs memo recall [query]` — human-readable session recall digest
- **Search** prior memos (superseded facts hidden by default):
  `node scripts/aios.mjs memo search "<query>" [--limit N]`
- **Persist** a durable fact you just established:
  `node scripts/aios.mjs memo add "<fact>"` — defaults to an appropriate scope; add
  `--scope project_shared` for facts anyone in the repo benefits from
- **Supersede** a previously recorded fact you now know is wrong:
  `node scripts/aios.mjs memo add "<corrected fact>" --supersedes <eventId>`
- **Mark useful** a recalled memory that actually shaped your outcome:
  `node scripts/aios.mjs memo useful <eventId>`

Run `node scripts/aios.mjs memo --help` for exact flags.

## When to persist (you judge)

Persist a durable, verified fact that a future you or a teammate will need — e.g. a
root cause you established, a fix you ran and confirmed, a decision rule. Do **not**
persist chatter, greetings, or in-progress noise. There is no automatic write: if you
do not record it, it is not remembered. When in doubt, prefer `project_shared` for
facts anyone in the repo benefits from, `agent_private` for personal working notes.

## Extraction contract (shape of a persistable entry)

Before you persist — via the declaration `conclusion=` or `memo add` — shape the
fact as one self-contained entry carrying five elements:

- `fact`: the durable statement, understandable without the surrounding turn.
- `entities`: the files, commands, symbols, or concepts the fact touches.
- `date`: absolute ISO date the fact was established. Never store relative time
  ("yesterday", "上周"); resolve it to a calendar date first.
- `evidence_ref`: what backs it — the verification command with exit code,
  the `file:line`, or the doc/plan/report path.
- `confidence`: `high` (ran and verified) or `medium` (established but indirect).

One entry = one fact. Split compound observations instead of bundling them.

Example entry:

```
fact: "Windows-only sha256 drift-guard failures were CRLF checkout artifacts, fixed by .gitattributes eol=lf"
entities: [drift-guard, .gitattributes, CRLF]
date: 2026-09-06
evidence_ref: "npm run test:scripts exit 0 + scripts/lib/specs/orchestrator-agents.json:272"
confidence: high
```

You declare these elements in your own words; the harness stores what you wrote
and never infers missing elements for you.

## Exclusions (do not persist)

- Greetings, pleasantries, acknowledgements, or restated user requests.
- In-progress noise: plans not yet executed, hypotheses not yet tested.
- Verbatim tool output or pasted logs without the conclusion they support.
- A fact you cannot attach an `evidence_ref` to — verify first, persist after.

## Editing discipline (corrections)

Supersede by precise replacement: quote the exact old statement, supply the new
statement, and link it with `--supersedes <eventId>`. Never silently rewrite
history — a correction is a new entry pointing at the entry it replaces, so the
log stays append-only and auditable.

## Declaration block (drives the automatic loop)

The harness injects a `## AIOS MEMORY DECLARATION` instruction into your prompt. At the
end of your reply, append one trailing block when this turn produced something durable:

```
<!--memory: verified=yes|no, useful=<eventId1,eventId2>, conclusion=<one-line takeaway> -->
```

- `verified=yes` only when this turn produced a **confirmed, durable fact** (a fix you
  ran and verified, a root cause you established). This is the trigger that persists a
  memory — the harness records it, never decides it.
- `useful=` lists the recalled eventIds above that you actually referenced.
- `conclusion=` is one line capturing the takeaway.

## What the harness does vs. what you do

| Concern | Owner |
|---|---|
| Tokenize/retrieve candidate memory into your prompt | harness (must run before you see anything) |
| Parse your declaration and persist it | harness (pure bookkeeping) |
| Whether a fact is durable / worth persisting | **you** (via `verified=` / `memo add`) |
| Whether a correction supersedes an old fact | **you** |
| Which recalled memory was useful | **you** (via `useful=`) |

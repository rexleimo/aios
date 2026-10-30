---
title: "v6.16.0: Fresh Context Stops Being a Hope — AIOS Measures It, Declares It, and Makes Forking Harmless"
description: "v6.16.0 turns \"fresh context, not a fork\" from something that happened to be true of the processes we spawn into a measured, declared, injected and test-pinned contract. AIOS-provided workers were already structurally fresh (one-shot prompt, `--resume` blocked by RESERVED_FLAGS); the host's own Task/Agent tool had zero constraints and no local evidence. So we measured it: a nonce probe (`aios agents probe --client <id>`) embeds `AIOS-NONCE-<16 hex>` in the parent and asks the child to repeat it — codex comes back `fork` with direct evidence, pi `not-applicable` because it declares no subagent surface, and `unknown` stays a legal verdict with a reason. `config/host-capabilities.json` gains a `subagents` side-car block (not a scorecard axis, which would move totals and force a report rewrite), role-card instructions converge on one owner so 38/38 generated cards carry exactly one Output Contract, and every dispatch now injects a self-contained `## Dispatch Brief` — which is what makes a fork harmless instead of prohibited: a worker missing a fact returns `blocked` rather than leaning on inherited context. Instrumenting `fs.readFileSync` also disproved our own documentation assumption: of ten shared native partials, exactly one (`core/core-instructions.md`) is ever read by a loader, so a gate now requires an explicit `composed` / `documentation-only` disposition per partial and proves it by behaviour in both directions. Along the way `stripManagedTables` was fixed: it compared TOML table names by textual spelling, which wrote duplicate `[projects.*]` keys and made every codex invocation exit 1, and its single skip flag swallowed human-written config until `MANAGED_END` — a latent data-loss path."
date: 2026-10-30
tags: ["AIOS", "v6.16.0", "subagents", "fresh-context", "capability-declaration", "agent-cards", "dispatch-brief", "testing", "release"]
---

# v6.16.0: Fresh Context Stops Being a Hope — AIOS Measures It, Declares It, and Makes Forking Harmless

> **TL;DR:** A subagent that inherits your conversation inherits your wrong premises too. We had one
> clean dispatch surface and one completely unmanaged one, and the loudest claim in the room ("Codex
> forks by default") was somebody else's assertion with zero local evidence behind it. This release
> measures it, declares it, writes the constraint into the artifacts *we* generate, and then removes the
> reason to care: a self-contained brief. `unknown` remains a legal answer. No gate goes red by default.

## The premise we refused to copy

Matt Pocock's skills line gives a concrete engineering reason for fresh context: an implementer that
inherits the parent transcript inherits the parent's *mistaken premise*, and never gets the context it
actually needs. Fine. But "Codex forks by default" arrived in our session as an outside claim, and this
repo's rule is that an unmeasured thing gets recorded as unmeasured. So before writing a single
instruction, we built a probe.

```
parent conversation   →  embeds AIOS-NONCE-A8AF556CF1934014, then asks the child to repeat it
child answer          →  repeats it   → fork
                        cannot repeat  → fresh
                        anything else  → unknown + reason
```

`aios agents probe --client codex --json` on a real headless codex run returned:

```
verdict=fork  reason=child-reported-parent-nonce  confidence=indirect
```

…with the banner still holding session `01a18ae5-a4a8-7882-988d-60e1e98bdb53` in the stored answer for
anyone to check. Pi answered differently: it has no subagent tool to begin with, so its declaration is
`surface: none` / `contextMode: not-applicable` at confidence `direct`. Eight clients are still `unknown`,
and that is deliberate.

## Two dispatch surfaces, treated differently

| Surface | Before v6.16.0 | Mechanism that owns it |
|---|---|---|
| Workers AIOS spawns | structurally fresh, by accident of construction | `one-shot.mjs` passes a one-shot prompt; `RESERVED_FLAGS` refuses `--resume` / `--continue` |
| The host's own Task/Agent tool | **zero** constraints — no declaration, no measurement, nothing in the cards | now: probe → declaration → card clauses → dispatch brief |

Three rules kept this honest while it was being built:

- **`unknown` is a legal verdict.** Never defaulted to `fresh`, and never a blocker.
- **A side-car block, not a capability axis.** `CAPABILITY_AXES` is a fixed token set; adding an axis
  moves scorecard totals and forces a report rewrite. `subagents` rides alongside it, so
  `client-capability-scorecard.mjs --check` stayed at zero drift.
- **A model's self-report corroborates, it does not create.** Pi saying "I have no subagent tool" is
  `direct` evidence *only because* the config already declared `surface: none`. For an undeclared client
  the same sentence stays `unknown / no-subagent-spawned`. Prose does not manufacture capability facts.

## The delivery surface we had assumed — and were wrong about

The plan said: put the discipline into the shared native partial and every client gets it. So we measured
delivery instead of trusting the layout, by instrumenting `fs.readFileSync` and running the real projection
for all ten clients:

```
core/core-instructions.md   →  read by composeNativeMarkdown() for 10/10 clients
other 9 partials            →  never read by anything. Zero callers.
```

`readSharedMarkdownParts` — the only function that would have pulled them in — has no call sites, in the
repo and in the installed runtime alike. And my own first count was wrong twice over: grep'ing basenames
reported "7 orphans" because it counted mentions in docs and blog posts as delivery. The real number was
nine. **A file being written is one fact; a model reading it is another.**

So the delivery surface is exactly two places, and both are ours:

- **Worker side** — three clauses, one owner (`emitters/shared.mjs`): no parent-conversation inheritance,
  work from the brief and the refs it names, missing fact ⇒ `blocked`, never ask the parent to paste its
  transcript. Generated cards now measure **38/38** with all three clauses and *exactly one* Output Contract;
  19 role sources had hand-copied stale field lists (`agentId/blockers/evidenceRefs`) that contradicted the
  enforced schema. The stale table is stripped at render time rather than deleted at source, because
  `REQUIRED_PROMPT_MARKERS` still requires the `## Output contract` heading.
- **Dispatcher side** — `## Dispatch Brief`, built by one pure function and rendered by one renderer,
  injected by the prompt assembler that already existed. No second assembler was added.

A fork stops being a correctness problem here: if every needed fact is in the brief, inheriting the
parent's context buys a worker nothing except wasted tokens.

## A gate that reports, and one that fails

`aios status` now shows the split instead of a single vague word:

```
subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
```

`fork` is called out as the risk case rather than absorbed into "measured", and the whole thing stays out
of `blockers` — this repo already learned with `duplicateLines` that a red-by-default gate without a
disposition plan gets muted, not fixed. What does go red is the delivery claim: `native-partial-delivery.test.mjs`
requires every partial to declare `composed` or `documentation-only` with a reason, then proves `composed`
ones by behaviour (read by a loader *and* visible in the emitted surface) and proves `documentation-only`
ones are **not** read. Both directions were tested by lying to the gate — a falsely claimed `composed`
went red, a silently-delivered partial went red.

## What the probe fell over on the way in

- **`stripManagedTables` compared TOML table names by spelling.** The same path written as
  `"C:\\Users\\..."` and `'C:\Users\...'` produced two `[projects.*]` tables for one decoded key, and codex
  stopped working entirely: `duplicate key`, exit 1, every command. The same function had a worse latent
  bug — one boolean state for "inside a managed block" meant an unmarked legacy AIOS table swallowed
  human-written config until `MANAGED_END`. Table identity is now a *decoded* key compared with
  `path.resolve()`, and block state is split in two.
- **The host banner fooled the classifier.** A real codex answer was recorded as `answer-not-json` because
  the parser sliced from the first `{` to the last `}` and the banner's echoed prompt broke it. It now scans
  balanced objects and accepts only one that carries `subagentSpawned` — and an echoed prompt nonce is
  explicitly *not* evidence of a fork.
- **Pi's JSON stream echoes the prompt**, nonce included. Classifying raw stdout would have produced a
  permanent fake `fork`, so the verdict reads only the parsed `assistantText`.
- **Evidence got a size limit.** One host stream measured 208,782 characters; answers are now stored
  bounded with `answerLength` / `answerTruncated` alongside them.
- **Windows shims returned no version.** `spawnSync('pi', …)` cannot read a version through the npm shim,
  which silently disabled version-drift detection forever. Version capture goes through the platform spawn
  spec now — the same single-owner rule as everything else here.

## Honest gaps in this release

- Completion criterion **D3 is not met**: a hermetic blank session handed *only* the brief and asked for a
  schema-valid handoff has never actually been run. The tests prove structural availability, and I am not
  going to let a static assertion impersonate a model run.
- 8 of 10 clients are still unmeasured. Each needs one real host call.
- Nine partials contain discipline text with no delivery surface. Writing it into the shared `AGENTS.md`
  would leak subagent instructions to clients that have no subagent tool, so that is a separate design
  decision — this release only pins down that a file is not a delivery mechanism.
- The installed runtime copy still contains the pre-fix `stripManagedTables`; a native install from it can
  re-create the duplicate key until the runtime is updated.

## Try it

```bash
aios agents probe --client <id> --json      # measure one host's context behaviour
aios agents probe --client <id> --dry-run   # what it would run, no model call spent
aios status                                 # subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
node scripts/aios.mjs standards --root . --rule directoryEntries
```

Evidence for this release: full regression 2484 tests / 2475 pass / 0 fail / 9 skipped; probe + declaration
+ runner suites 28/28; 38/38 generated cards carrying exactly one contract; `check-syntax` 1296 files / 0
failures; `scorecard --check` ok across 13 clients with no drift; `check-doc-citations` invalid 335 → 335
while refs went 542 → 563.

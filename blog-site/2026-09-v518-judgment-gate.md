---
title: "v5.18.0: TypeSafe Jev in AIOS — Off by Default, On Purpose"
description: "Configure TYPESAFE_API_KEY in four steps, understand why a docs MCP can never produce a judgment, and why the new aios judgment gate stays disabled until you explicitly enable it."
date: 2026-09-18
tags: ["AIOS", "TypeSafe", "Jev", "System One", "MCP", "supply chain", "release", "v5.18.0"]
---

# v5.18.0: TypeSafe Jev in AIOS — Off by Default, On Purpose

AIOS v5.18.0 adds an opt-in **judgment gate**: a way for a workflow to ask TypeSafe's System One model (Jev) one narrow, typed question and get a calibrated answer back. It also fixes a bug that could silently break a whole Gemini CLI config, and closes a frontmatter leak that shipped internal keys into client skill trees.

This post is the honest version, including the part where we discovered the previous release could not possibly have done what it looked like it did.

## Quick answer

| Question | Answer |
| --- | --- |
| How do I configure the credential? | Set `TYPESAFE_API_KEY` in the environment your client runs in, then **restart the client**. Four commands below. |
| Does installing the TypeSafe integration make Jev answer things? | No. It installs a **docs** MCP server. It searches documentation; it cannot produce a judgment. |
| Is the judgment gate on after I install it? | No. It is off until you run `aios judgment enable typesafe`. |
| What happens if the credential or the flag is missing? | Nothing is sent. There is no fallback that assumes an answer. |

## The thing we got wrong first

We shipped `aios integration add typesafe` in the previous release. It pins the vendor skill by commit, verifies its sha256, and registers `typesafe-docs` on every client. The doctor said `verified`. It looked finished.

Then we measured what the installed pieces can actually do:

| Piece | What it can do |
| --- | --- |
| `typesafe-docs` MCP | 4 tools: `search_type_safe_ai`, `query_docs_filesystem_type_safe_ai`, `submit_feedback`, `read_typesafe`. **All documentation retrieval. No inference tool.** |
| The vendored `typesafe-ai` skill | It is TypeSafe's own skill. `grep -c 'TYPESAFE_API_KEY\|POST\|curl\|systemone'` → **0**. It teaches the concepts and points at the live docs. |
| AIOS runtime | Zero call sites. |

So the previous release installed a *map* of Jev and never touched Jev itself. That is not a bug in the installer — the plan explicitly listed "any credentialed call to the TypeSafe API" as out of scope. It is a gap in the story, and this release closes it.

The lesson generalizes: **"the integration is installed" and "the capability can be used" are different claims.** Only the second one is worth a doctor check.

## Configure the credential

`TYPESAFE_API_KEY` is the only credential involved. AIOS checks **presence only** — it never reads, prints, or stores the value. You set it in the environment your coding client actually runs in.

The most common failure is scope: a variable exported in one terminal, or written into the *User* scope of a different account, is invisible to an already-running client.

**Windows — persists for your account:**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'User')
```

**Windows — all accounts (needs an elevated shell):**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'Machine')
```

**macOS / Linux:**

```bash
export TYPESAFE_API_KEY="<your-key>"                                # this shell only
echo 'export TYPESAFE_API_KEY="<your-key>"' >> ~/.bashrc            # persist
```

Then **restart your coding client**. Environment variables are read once, at process start. A client that is already open will never see a value you set afterwards — and that is the single most common reason a correctly-installed integration still reports "no credential".

Check what the client will see:

```bash
aios integration doctor typesafe
```

The credential row reports `present` or `unset`, and never the value.

## Turn on the gate

```bash
aios judgment status                    # disabled until you say otherwise
aios judgment enable typesafe           # writes ~/.aios/judgment/config.json
aios judgment enable typesafe --probe   # ...and send exactly one metered call
```

Three conditions must hold before a single byte leaves your machine:

| # | Condition | Default |
| --- | --- | --- |
| 1 | `TYPESAFE_API_KEY` is present in the process | unset |
| 2 | `enabled: true` in `~/.aios/judgment/config.json` | `false` |
| 3 | The session call and input-size budgets are intact | 20 calls, 20000 chars |

If any of them fails, the call surface does not exist. No request is sent, and no code path falls back to assuming an answer. `--probe` is the only thing in AIOS that will spend money without you using `ask` directly, and it only runs because you typed it.

## A judgment is a proposal, not a fact

This is the design decision that matters most. Jev does not get to write anything. Every result carries its model, its `x-typesafe-request-id`, its token usage, and a confidence — and the runtime does the only thing it is allowed to do with that: compare it against a threshold you configured.

| Verdict | Condition | Meaning |
| --- | --- | --- |
| `act` | confidence ≥ `actFloor` | proceed without asking |
| `confirm` | between the two floors | ask a human first |
| `abort` | confidence < `confirmFloor` | do not act |

Two rules keep this from becoming an authority:

- **Risk only ever raises the floor.** A destructive change needs more confidence than a read-only one. There is no path where a judgment makes AIOS do something a gate would otherwise refuse.
- **A `Noul` answer carries no confidence by design.** The API does not return one, so the gate uses the probability itself and says so, rather than manufacturing a number that looks like a confidence.

The shape is validated before the value is trusted. If a `choice` answer names an option that was never declared, or an answer's `type` does not match the question that was sent, that is an error — never a coerced value.

## What else shipped

- **Gemini CLI config repair.** AIOS was writing `startupTimeoutSec` (seconds) into `~/.gemini/settings.json`. Gemini validates MCP server entries in strict mode, and the field it actually accepts is `timeout`, in **milliseconds** — so one wrong key silently invalidated the *entire* config and Gemini refused to start. A normalizer with an explicit field allowlist now mirrors the existing ZCode path, and both previously-written config files were migrated in place with backups.
- **Frontmatter leak on CRLF files.** `parseFrontmatter` decided whether a file had frontmatter by testing `lines[0] !== '---'`. On a CRLF file that line is `'---\r'`, so the check failed, the parser returned the file untouched, and AIOS's internal keys (`clients`, `scopes`, `repoTargets`, …) shipped straight into client skill trees — exactly what the docs promise never happens. The parser now normalizes line endings on the way in and always emits LF. AIOS's own hash check never caught it because it normalizes line endings *before* hashing.
- **Honest client coverage rows.** Gemini is now a verified `cli` transport. ZCode turned out to be an Electron client with no CLI on `PATH` — AIOS writes stdio servers into `~/.zcode/cli/config.json` under `mcp.servers` and ZCode reads them, but its HTTP entries need a `url` field AIOS does not write yet, so those remain a manual step. The docs no longer imply otherwise.
- **Two version-locked docs gates.** `check:site-sync` requires a release blog post in every locale. It was failing before this release.

## Evidence

The gate was verified end to end against the live endpoint, not a mock:

```text
POST https://api.typesafe.ai/v1/systemone
date: Fri, 18 Sep 2026 11:54:33 GMT
HTTP/1.1 200 OK
x-typesafe-request-id: req_01a0b45e4b9d76d6b5346020c5df7aa9
{"model":"jev-1.13.0",
 "answers":{"severity":{"type":"score","score":2.94,"confidence":0.94,
            "probabilities":{"0":0.0,"1":0.01,"2":0.05,"3":0.94}}},
 "usage":{"input_tokens":325,"output_tokens":17}}
```

The `x-typesafe-request-id` is issued by the server, and the response carries an `istio-envoy` upstream timing header — the request really traversed TypeSafe's gateway and was metered.

The disabled path is verified too: with no config and no enable flag, the test suite asserts that the transport is never invoked. That is the property we care about most, so it is asserted rather than described.

## The part we cannot answer yet

Our TypeSafe console shows **zero requests** for this credential, even though we have server-issued request ids for every call. There is no usage API to query (`/v1/me`, `/v1/account`, `/v1/usage` all 404), and `Spend $0.00` proves nothing when 325 input tokens at $0.042/MTok rounds to $0.0000137.

The most likely explanation is that the key belongs to a different organization than the console we are looking at. We are publishing this rather than hiding it, because "the dashboard says zero" is exactly the kind of signal that gets ignored until it matters. If you are wiring a metered vendor into your own workflow, record the vendor's own request id on every call — it is the only evidence that survives a disagreement about billing.

## Upgrade

```bash
aios update
aios judgment status
```

The gate stays off after the upgrade. That is the point.

## Next

The full reference ships with the docs and is translated into English, Chinese, Japanese, and Korean:

- `docs-site/integrations.md` — credential setup, per-client coverage, and the judgment gate reference.
- `docs-site/workflow-policy.md` — how AIOS decides between direct, guarded, and planned work.

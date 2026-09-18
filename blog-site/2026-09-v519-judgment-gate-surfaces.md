---
title: "v5.19.0: Giving the Judgment Gate a Body"
description: "The opt-in Jev gate now reaches the two surfaces work actually flows through: an aios_judge MCP tool that is absent while disabled, and a rex stage gate that can only hold an advance."
date: 2026-09-18
tags: ["AIOS", "TypeSafe", "Jev", "System One", "MCP", "rex", "release", "v5.19.0"]
---

# v5.19.0: Giving the Judgment Gate a Body

v5.18.0 shipped a judgment gate that nobody could reach. It had a config layer, a single-egress client, a verdict mapper and a CLI — everything except a connection to the place where work actually flows. This release attaches it, and the attachment points are the interesting part.

## A gate you cannot reach is not a gate

The v5.18.0 gate was honest about being off: three conditions had to hold before a single byte left the machine, and there was a test asserting zero network calls while disabled. But "off" was doing double duty as "finished", and it wasn't. A capability that exists only behind a CLI subcommand you have to remember is not a gate in a workflow; it's a tool in a drawer.

So v5.19.0 adds exactly two surfaces, and no more:

| Surface | When it fires | Effect |
| --- | --- | --- |
| `aios_judge` MCP tool | only while the gate is enabled and the credential is present | the tool shows up in `tools/list`; while disabled it is absent rather than present-but-refusing |
| rex stage gate | before a provider's evidence can advance a rex stage | the advance is held when the evidence is not verifiable |

Neither surface can author content, and neither can turn a rejected advance into an allowed one. That is the whole design constraint: **a judgment may only narrow an action.**

## Surface 1 — absence, not refusal

The obvious way to ship an opt-in tool is to register it always and return "not enabled" when called. We did the opposite: while disabled, `aios_judge` is not in the tool list at all.

That is a deliberate bet about how models behave. A tool that is *listed* is a tool that *gets tried*, and an agent that reads "not enabled" starts negotiating with the environment — retrying, guessing at config keys, or worse, narrating the judgment it would have received. Removing it from the list removes the affordance instead of arguing with it.

The refusal path still exists, because defence in depth is cheap: a `tools/call` for a disabled tool is rejected, and a test asserts that the transport recorded zero calls. The tool is invisible *and* inert.

There is one consequence worth stating plainly. `enable` writes a config file, and a long-running MCP server reads it per `tools/list` request — so turning the gate on takes effect without restarting the server, while the credential still has to be present in the **client's** environment, which is why the docs keep saying "restart your client".

## Surface 2 — advance or hold, nothing else

The rex stage gate asks one `noul` question before a provider's evidence is allowed to advance a stage: does this evidence demonstrate verifiable completion, judged only on what the evidence shows?

The answer has exactly two outcomes. `hold` is a normal result with a printed reason, not a crash, because "we could not verify this" is information the operator needs, not an error to retry.

The gate lives host-side, in `scripts/lib/ctx-agent-core/run.mjs`, immediately before evidence ingestion. The rex submodule does not know it exists. That matters for two reasons: the subsystem stays a state machine rather than a policy engine, and leaving the gate disabled restores the previous behaviour exactly — the disabled path returns `advance` before it parses anything, and there is a test that pins that ordering by feeding it an output with no evidence envelope and asserting the gate still reports `disabled`.

### The uncomfortable default

If the gate is enabled and the vendor is unreachable — a 500, a timeout, a 429 that survives backoff — the default is to **hold**. Not to proceed.

That is the fail-closed reading, and it is defensible because you enabled the gate on purpose: silently degrading to "assume yes" would quietly convert a safety control into decoration. But it is a real tradeoff, so it is a config key rather than a hidden constant: set `onJudgmentError` to `"allow"` if you would rather let a vendor outage pass. The default is `"hold"`, and the reason string always names which policy was applied.

## Two things we got wrong, and fixed in the open

**The deterministic precheck is redundant.** The gate refuses to spend a call on evidence that carries no usable reference. Reading our own envelope parser afterwards, it turns out the parser already rejects empty evidence arrays and empty refs — so in the runner path the precheck can never fire. We kept it (it is load-bearing for callers that supply an already-parsed envelope) but the code comment now says so. A check that looks like it is doing work it isn't is worse than no check, because it misleads the next reader.

**A new config key can silently disable an existing gate.** Adding `onJudgmentError` as a required field would have made every config file written by v5.18.0 fail validation — and the validator's failure mode is `disabled`. A user who had deliberately switched the gate on would have had it switched off by an upgrade, with no message. The key is therefore optional-with-default, and there is a test named for exactly that scenario.

Both of those were found by asking "what does the previous release's data look like when it meets this code?", which is a cheaper question than it sounds.

## What is still deliberately off

The third trigger point from the design — routing an ambiguous request to a workflow by asking Jev to classify intent — is still not implemented, and not for lack of time. The repository contract forbids inferring `intent` from prose: a model that supplies the intent field *is* the inference. Asking a second model to guess the same field does not make it a declaration.

Also still open: the TypeSafe console shows zero requests for the credential we used, even though the vendor's own gateway returned a signed `x-typesafe-request-id` and a token count for each call. That is a vendor-side question, not a code question, and it is documented rather than papered over.

## Enable it

```bash
aios judgment status                 # disabled until you say otherwise
aios judgment enable typesafe        # writes ~/.aios/judgment/config.json
aios judgment enable typesafe --probe   # plus exactly one metered call, because you asked
```

Then restart your client so it inherits `TYPESAFE_API_KEY`. `aios doctor typesafe` verifies the credential presence and the live MCP handshake without printing the value.

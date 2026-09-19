---
title: "Jev + AIOS Quickstart: Background Judgments With No Keywords (JVM Confusion Explained)"
description: "Set TYPESAFE_API_KEY, run aios integration add typesafe and aios judgment enable typesafe, then chat normally while Jev (jev-latest) judges in the background. Covers why installing alone never triggers, the aios_judge and rex stage gate surfaces, budgets, and the JVM/MVC name mix-up."
date: 2026-09-19
tags: ["AIOS", "TypeSafe", "Jev", "System One", "judgment gate", "MCP", "quickstart", "JVM"]
---

# Jev + AIOS Quickstart: Background Judgments With No Keywords

If you installed the TypeSafe integration and nothing happened, that is the system working as designed. Installing teaches your agents about Jev. **Enabling** lets Jev answer. This post gets you from zero to a background judgment in four commands.

## Quick answer

| Question | Answer |
| --- | --- |
| I installed TypeSafe — why does Jev never answer? | The integration installs a **docs** MCP server. Docs search cannot judge. Run `aios judgment enable typesafe`. |
| Do users need to say a keyword like "JVM"? | No. After enabling, keep chatting normally. The gate fires in the background. |
| What is "JVM" / "JVM MVC" that people mention? | Speech-to-text for **Jev** plus the **MCP** docs server heard together. The model is `jev-latest`; the server is `typesafe-docs`. |
| What does it cost? | One metered call per judgment, capped at 20 calls and 20,000 input chars per session by default. |

## Step 0 — Understand the two halves

| Half | What it is | Can it call Jev? |
| --- | --- | --- |
| `aios integration add typesafe` | Pinned skill (`65a39f3`, sha256-verified) + `typesafe-docs` MCP on all nine clients | Never. Docs retrieval only. |
| `aios judgment enable typesafe` | Writes `enabled: true` to `~/.aios/judgment/config.json` | Yes — and only with `TYPESAFE_API_KEY` present. |

## Step 1 — Install the integration

```bash
aios integration add typesafe --dry-run   # preview every client change, writes nothing
aios integration add typesafe             # install skill + register docs MCP
aios integration doctor typesafe          # verify hash, registrations, credential presence
```

## Step 2 — Set the credential and restart the client

`TYPESAFE_API_KEY` is the only secret. AIOS checks presence only — it never reads, prints, or stores the value.

```powershell
# Windows, persists for your account
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<your-key>', 'User')
```

```bash
# macOS / Linux
export TYPESAFE_API_KEY="<your-key>"                              # this shell only
echo 'export TYPESAFE_API_KEY="<your-key>"' >> ~/.bashrc          # persist
```

Then **restart your coding client**. Environment variables are read once at process start; an already-open client never sees a value set afterwards.

## Step 3 — Enable the gate

```bash
aios judgment status           # expect: disabled, credential present
aios judgment enable typesafe  # writes ~/.aios/judgment/config.json
aios judgment status           # expect: ENABLED, model jev-latest
```

Optional honesty check (spends exactly one metered call, only because you asked):

```bash
aios judgment enable typesafe --probe
```

## Step 4 — Chat normally; Jev works in the background

No keywords. No "please use JVM". Just work:

- Ask for a risky change. Before the batch runs, the gate can score its severity and pick `strict-tdd` over `tdd` — or ask you first.
- Finish an implement turn. Before the rex stage advances, the gate asks Jev one `noul` question: does this evidence demonstrate verifiable completion? Below the floor, the advance is held with a printed reason.

Try one manual judgment to see the shape:

```bash
aios judgment ask --state "Deleted the sessions table in production with no backup." \
  --questions '{"severity":{"type":"score","instructions":"How risky is this change?","criteria":["Trivial","Routine","Risky","Data loss"]}}' \
  --risk destructive --json
```

Every answer is a **proposal, not a fact**: it carries `model`, `x-typesafe-request-id`, token `usage`, and a confidence mapped to `act` / `confirm` / `abort`. Destructive actions need more confidence than read-only ones; nothing the gate says can author content or overrule a rejection.

## Guardrails worth knowing

- **Default off, fail closed.** Missing credential, missing flag, or broken config means no tool in `tools/list`, zero network calls, and an actionable refusal.
- **Two surfaces, both narrowing.** `aios_judge` appears only while enabled; the rex stage gate can only `advance` or `hold`. Neither can widen an action.
- **Auditable spend.** Each call records `requestId` + `usage` + caller surface.
- **Vendor outage defaults to hold**, because you enabled the gate on purpose. Set `onJudgmentError: "allow"` if you would rather let outages pass.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Installed but nothing triggers | Normal until enabled: `aios judgment enable typesafe` |
| `credential ... (NOT SET)` | Set `TYPESAFE_API_KEY` in the client's environment, then restart the client |
| `judgment-disabled` on `ask` | Enable first; exit code 3 means "not enabled", not "broken" |
| Agent says "JVM model" | It means Jev (`jev-latest`). No action needed. |

## Next steps

- [TypeSafe Jev in AIOS — Install, Enable, Run in Background](https://cli.rexai.top/integrations/) — the reference page.
- [v5.19.0: Giving the Judgment Gate a Body](2026-09-v519-judgment-gate-surfaces.md) — why the tool is absent while disabled.
- [v5.18.0: Off by Default, On Purpose](2026-09-v518-judgment-gate.md) — the fail-closed design.

---
title: "aios memo GUI: See Your Agent's Memory As a Living Graph"
description: "Introducing the visual interface for ContextDB — explore sessions, checkpoints, and memory relationships as an interactive node graph."
date: 2026-05-15
tags: ["aios memo", "ContextDB", "GUI", "visualization", "memory graph", "AIOS"]
image: "assets/aios-memo-gui-screenshot.png"
---

# aios memo GUI: See Your Agent's Memory As a Living Graph

Your coding agent has been working for weeks. It's written code, fixed bugs, made decisions. But what does that history actually *look like*?

**Now you can see it.**

The aios memo GUI is a visual interface for ContextDB — it turns your agent's session history into an interactive node graph where you can explore what happened, when, and how it all connects.

<figure>
  <img src="assets/aios-memo-gui-screenshot.png" alt="aios memo GUI showing ContextDB as an interactive node graph with session details panel">
  <figcaption>The aios memo GUI: your project's memory, visualized.</figcaption>
</figure>

## What You're Looking At

The screenshot above shows the **ContextDB view** in the aios memo GUI. Here's what each part means:

**The graph (left side):**
- Each **node** is a piece of your project's memory — a session, a checkpoint, a reference to a file
- **Lines between nodes** show relationships: "this checkpoint came from that session", "this file was referenced in that event"
- **Purple nodes** are references to actual files in your project

**The details panel (right side):**
- Click any node to see its full details
- Shows metrics like trust score and risk level
- Lists parent sessions and evidence references
- Displays the source file path

**The top bar:**
- Quick stats: how many nodes, sessions, checkpoints, and risks
- Filter tabs: All, Sessions, Checkpoints, Events, Risks
- Search: find specific nodes by name

## Why This Matters

Before the GUI, understanding your agent's history meant:

- Digging through files in `memory/context-db/sessions/`
- Running CLI commands and reading JSON output
- Trying to mentally connect sessions, checkpoints, and events

**Now you can just look at it.**

Need to know what your agent was doing last Tuesday? Click the session node. Want to see which files were touched during a specific checkpoint? Follow the edges. Trying to find risks that were flagged? Filter by the Risks tab.

## Getting Started

The aios memo GUI reads from your existing ContextDB data. If you already have AIOS set up with `.contextdb-enable` in your project, your data is ready.

1. Open the GUI and point it to your project
2. Click **Load** to import your ContextDB data
3. Explore the graph — click nodes, follow connections, use search

The graph loads your project's full memory: sessions, checkpoints, events, file references, risk flags, and handoff records. Everything that ContextDB has recorded, now visible at a glance.

## What You Can Do With It

### Trace a bug across sessions

Click on a risk node, then follow its edges back to the session and checkpoint where it was first detected. See exactly what the agent was doing when the issue appeared.

### Understand memory lineage

See how sessions connect: which checkpoint spawned the next session, which files were referenced across multiple sessions, how context was handed off between agents.

### Audit agent behavior

The trust score and risk level on each node give you a quick health check. Filter by "Risks" to see only flagged items, then investigate each one.

### Search for specific events

Use the search bar to find nodes by file name, session ID, or any text content. No more grepping through JSONL files.

## The Bigger Picture

The aios memo GUI is part of the **ContextDB** ecosystem — the memory system that makes your coding agents remember across sessions. While ContextDB runs automatically in the background (recording events, creating checkpoints, building context packs), the GUI gives you a human-readable view of what's happening.

It's not just pretty — it's practical. When you're debugging an agent that went off track, trying to understand why a decision was made, or auditing what happened during an overnight harness run, the visual graph tells the story faster than any log file.

## Try It

If you're already using AIOS with ContextDB enabled, your data is ready. Open the aios memo GUI and start exploring.

New to AIOS? Start with the [Quick Start guide](https://cli.rexai.top/getting-started/) to get ContextDB running in your project, then come back and visualize your agent's memory.

---

*The aios memo GUI is part of the [AIOS](https://cli.rexai.top) ecosystem. [Get started](https://cli.rexai.top/getting-started/) or [read the ContextDB docs](https://cli.rexai.top/contextdb/) to learn more about agent memory.*

## Related

- [ContextDB](https://cli.rexai.top/contextdb/)
- [Quick Start](https://cli.rexai.top/getting-started/) — install AIOS in 30 seconds
- [Workflow Policy](https://cli.rexai.top/workflow-policy/) — direct / guarded / planned routes

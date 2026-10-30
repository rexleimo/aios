---
title: "v7.0.0: Grill Must Resolve Critical Unknowns Before Implementation"
description: "Requirements now report decision dependencies, failure paths, feasibility evidence and existing user alignment. Rex rejects missing or blocked readiness while preserving the current clarification command."
date: 2026-10-30
tags: ["AIOS", "v7.0.0", "requirements", "grill", "release"]
---

# v7.0.0: Grill Must Resolve Critical Unknowns Before Implementation

This change addresses a specific failure: an agent could ask three questions,
record the remaining unknowns as assumptions, and move into implementation before
working out whether the proposed workflow was feasible.

The revised grill maintains decision dependencies and checks a normal path and a
meaningful failure path. Facts come from investigation; user questions focus on
choices that change behavior or acceptance. Existing user instructions count as
alignment, so the change does not introduce another approval round.

Rex requirements decisions now include `readiness`. A ready record requires a
closed dependency graph, no open decisions or critical assumptions, walkthrough
references, supported feasibility and confirmed alignment. Missing or blocked
readiness preserves the current clarification command. Explicit low-impact,
reversible defaults remain valid assumptions.

This tightens a public submission contract, so the prepared versions are AIOS
7.0.0 and Rex Harness 1.0.0. Historical decisions remain readable; callers making
new requirements submissions must include the readiness record. Release order is
Rex first, then the host. This source change has not itself been published.

The method borrows decision-tree and frontier analysis from Matt Pocock's
`grilling` and the specification completion criterion from `loop-me`. AIOS keeps
one-question interaction and adds evidence-backed feasibility reasoning.

Runtime checks declared structure and consistency. It cannot prove that a model
considered every semantic branch or that every cited document is true. Public API,
standalone CLI and host adapter tests exercise the refusal and progression paths;
static skill certification is not a model-performance benchmark.

---
title: "v8.1.0: The Console Speaks Your Language"
description: "Every Console surface now switches between简体中文, English and 日本語 — 1014 previously hard-coded strings went through the same catalog seam, guarded by a test that fails on untranslated copy."
date: 2026-11-23
tags: ["AIOS", "v8.1.0", "console", "i18n", "release"]
---

# v8.1.0: The Console Speaks Your Language

The earlier language switcher translated the shell, navigation and home view.
Everything past that boundary — the gateway, model routing, resources, flows
and client panels — still showed source-language copy. That is fixed in v8.1.0.

## What changed

- All 1014 UI-authored strings now resolve through one catalog seam. Each of
  `zh-CN`, `en` and `ja` carries the same 1100 keys.
- A source guard test fails on any new hard-coded Chinese literal, with no
  allowlist. Translation coverage cannot quietly regress.
- Switching the language writes the `aios-locale` cookie and reloads, so
  module-level labels follow the choice too. Routes and `?ws=` deep links stay
  the same.

## Why it matters

A local control plane should not force one language on the person running it.
The Console now keeps its choice across reloads and deep links, and every panel
on the way — not just the first screen — is in the selected language.

Backend payload text (CLI output, file paths, model IDs) is deliberately left
verbatim: it is data, not UI copy.

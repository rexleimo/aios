---
title: "v5.4.1: Why 'aios update' Broke on Windows and How We Fixed Self-Updating"
description: "v5.4.1 fixes a Windows-only self-update failure: running 'aios update' from inside the install tree locked the directory the installer must delete, silently nesting the new version and breaking re-exec with MODULE_NOT_FOUND. Here is the root cause and the three-layer fix."
date: 2026-08-02
tags: ["Harness CLI", "self-update", "Windows", "installer", "release", "bug fix"]
---

# v5.4.1: Why "aios update" Broke on Windows and How We Fixed Self-Updating

> **Quick Answer:** v5.4.1 fixes a Windows-only self-update failure. If you ran `aios update` from inside the install tree, the process working directory pinned the directory the installer needs to delete — Windows cannot delete a cwd-held directory — so removal failed silently, the new version was nested at `<install>/harness-cli/`, and the follow-up update crashed with `MODULE_NOT_FOUND`. The fix moves the working directory out of the install tree first, makes the installer verify the old directory was actually removed (failing loudly instead of nesting), and gives re-exec a clear error when the replace goes wrong.

## The bug: self-updating on Windows could break the install

`aios update` on a release install (no git worktree) re-runs the release installer in place. On Windows, a directory that is the current working directory of a running process **cannot be deleted**. When you ran update from inside `~/.rexcil/harness-cli` — the most natural thing to do — the process cwd pinned the install tree:

1. The installer's remove step failed silently (`-ErrorAction SilentlyContinue` swallowed the error).
2. `Move-Item` saw the target directory still existed and nested the fresh version at `<install>/harness-cli/`.
3. The post-update re-exec could not find `scripts/aios.mjs` and died with a bare `MODULE_NOT_FOUND`, leaving a half-replaced install.

This was exactly the kind of bug that looks like "the tool is broken" when it is really one Windows API rule: you cannot delete the directory you are standing in.

## The fix: three layers

1. **Move first.** Before running the release installer, the updater relocates its own working directory outside the install tree (`ensureWorkingDirectoryOutsideInstallTree`), so nothing pins the directory that must be replaced.
2. **Verify loudly.** `aios-install.ps1` / `aios-install.sh` now check that the old directory was actually removed and fail with a clear message ("files may be locked by a running aios/node process") instead of silently continuing into a nested install.
3. **Guard re-exec.** The post-update process checks its entry point exists and, if the replace went wrong, prints a concrete remediation message instead of a cryptic module error.

The updater also prefers the local `scripts/aios-install.ps1` for release-installer updates, so defensive installer fixes take effect immediately instead of waiting for a remote fetch.

## What you should do

- If you are on 5.4.0 or earlier and have ever seen `MODULE_NOT_FOUND` after `aios update`: re-run the installer once (`irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex`), then future `aios update` runs are safe.
- If you have an oddly nested `~/.rexcil/harness-cli/harness-cli/` directory from a failed update, remove it (or reinstall) — it is a leftover from the old failure mode.

## FAQ

### Did this affect non-Windows installs?

No. Unix shells do not pin the cwd the same way, and the failure was specific to the Windows directory-lock behavior. The defensive checks now run everywhere.

### Is `aios update` the only path affected?

The same in-place replace is used by any update of a release install. The working-directory relocation applies to that whole path.

### Where can I see the details?

The [Changelog](https://cli.rexai.top/changelog/) documents v5.4.1, and the fix itself is in the release assets — once you are on 5.4.1, updating is safe.

A self-updater that can break its own install is worse than no updater at all. v5.4.1 makes the common case — updating from inside the install directory — the tested, safe one.

# Cross-Platform Audit Report

**Date:** 2026-05-22 | **Repository:** rex-ai-boot | **Version:** 1.20.5

---

## Executive Summary

Comprehensive audit of all platform-specific code across the project. Found **18 actionable issues** across 12 files, plus 10 shell scripts without `.ps1` Windows equivalents. The most critical gaps are: CDP browser service (macOS-only), inconsistent `HOME`/`USERPROFILE` handling, and hardcoded `python3` in credential tooling.

---

## Section 1: Python → uv/uvx Migration Plan

### 1.1 Current State

| What | Status |
|------|--------|
| `uv` as preferred venv manager | Already implemented (`browser.mjs:288`) |
| `uvx` for code-review-graph MCP | Already implemented (`codemap.mjs:73`) |
| `python3` hardcoded in `aios-cred.mjs` | **HIGH — no platform check** |
| `doctorBrowserMcp` hardcodes `.venv/bin/python` | **MEDIUM — ignores existing `resolveVenvPythonPath()`** |
| Legacy `python -m venv` fallback | **LOW — dead code behind `uv` check** |

### 1.2 Migration Steps

| Priority | File | Change |
|----------|------|--------|
| **P1** | `scripts/aios-cred.mjs:20` | Replace `spawnSync('python3', ...)` with `uv run python` for credential helper. `uv run` finds the correct Python on all platforms. Fallback: use platform-aware `resolvePythonCommand()`. |
| **P2** | `scripts/lib/components/browser.mjs:833` | Replace hardcoded `path.join(browserUseProjectDir, '.venv', 'bin', 'python')` with `resolveVenvPythonPath(browserUseProjectDir)`. |
| **P3** | `scripts/lib/components/browser.mjs:291-296` | Remove legacy `python -m venv` + `pip install` fallback (lines 291-296). `uv sync` is already preferred at line 288. If `uv` is absent, fail with a clear error message suggesting `pip install uv` or `brew install uv`. |
| **P4** | `scripts/lib/components/browser.mjs:861-866` | Doctor: remove `python3` fallback, make `uv` the only check path. |
| **P5** | `scripts/tests/aios-components.test.mjs:422` | Use platform-aware python resolution in test fixtures. |

---

## Section 2: Critical Issues (Will Crash or Block on Non-macOS)

### C1: CDP Browser Service — macOS Only
- **Files:** `scripts/lib/components/browser.mjs:458-653`
- **Impact:** `startBrowserCdpService`, `stopBrowserCdpService`, `restartBrowserCdpService`, `statusBrowserCdpService` all call `assertDarwinPlatform()` and fail on Windows/Linux.
- **Root cause:** Uses `launchctl`, `~/Library/LaunchAgents/*.plist`, `~/Library/Logs`, `~/.local/bin`. No systemd (Linux) or nssm/Task Scheduler (Windows) equivalent.
- **Fix:** For now, improve error message. Long-term: implement `systemd --user` for Linux, Task Scheduler for Windows.

### C2: `HOME` Without `USERPROFILE` Fallback
- **File:** `scripts/lib/components/browser.mjs:493`
- **Current:** `const homeDir = process.env.HOME || os.homedir()`
- **Fix:** `const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir()` (pattern already used in `contextdb-shell-bridge.mjs`)

### C3: Hardcoded `python3` in Credential Helper
- **File:** `scripts/aios-cred.mjs:20` — `spawnSync('python3', args, opts)`
- **Impact:** Fails on Windows (binary is `python`) and systems without bare `python3`.
- **Fix:** Replace with `uv run` or `resolvePythonCommand()`. See P1 above.

---

## Section 3: High Severity Issues

### H1-H3: Incomplete Browser Executables Per Platform
- **File:** `mcp-server/src/browser/launcher.ts:114-150`
- **Missing macOS:** Brave, Arc, Chrome Beta, Chromium (Homebrew)
- **Missing Windows:** Brave, Chrome Canary
- **Missing Linux:** Brave, Vivaldi, Opera, Flatpak Chromium/Brave
- **Fix:** Add candidate paths (see Section 5 for full list).

### H4: CDP Launcher Embeds macOS-Only Chrome Paths
- **File:** `scripts/lib/components/browser.mjs:530-537`
- Same macOS-only constraint as C1.

### H5: Credentials Module Uses macOS-Only `security` CLI
- **File:** `scripts/browser-use-bootstrap.py:150-195`
- Has `FileNotFoundError` catch, so doesn't crash, but silently fails on non-macOS.
- **Fix:** Add Linux `secret-tool` and Windows `cmdkey` backends.

### H6: MCP Launcher Calls `security` Without Guard
- **File:** `scripts/run-browser-use-mcp.sh:89-102`
- `.ps1` counterpart correctly skips. Add `[[ "$(uname)" != "Darwin" ]]` guard to `.sh`.

### H7: `self-update.mjs` Uses `HOME` Without `USERPROFILE`
- **File:** `scripts/lib/lifecycle/self-update.mjs:91,97`
- `cwd: process.env.HOME || rootDir` misses Windows users.
- **Fix:** `cwd: process.env.HOME || process.env.USERPROFILE || rootDir`.

---

## Section 4: Medium Severity Issues

### M1-M6: Shell RC Detection Only Handles `.zshrc`
- **Files:** `paths.mjs:36-38`, `aios-install.sh:216`, `update.mjs:158`, `setup.mjs:148`, `uninstall.mjs:72`, `shell.mjs:27`
- All assume non-Windows = `~/.zshrc`. No `.bashrc` or `config.fish` support.
- **Fix:** Detect `SHELL` env var and return appropriate rc file.

### M7: Shell Integration `.zsh` Extension
- **File:** `shell.mjs:27` — `buildPosixBlock()` sources `contextdb-shell.zsh`
- Works functionally in bash but misleading. Rename or add comment.

### M8: Bracket Notation Inconsistency
- **File:** `mcp-server/src/browser/launcher.ts:127,129`
- `process.env['PROGRAMFILES']` vs `process.env.PROGRAMFILES` — minor style inconsistency.

---

## Section 5: Browser Executable Candidates (Full List)

### macOS additions:
```
/Applications/Brave Browser.app/Contents/MacOS/Brave Browser
/Applications/Arc.app/Contents/MacOS/Arc
/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta
/opt/homebrew/bin/chromium
```

### Windows additions:
```
%LOCALAPPDATA%/BraveSoftware/Brave-Browser/Application/brave.exe
%LOCALAPPDATA%/Google/Chrome SxS/Application/chrome.exe
```

### Linux additions:
```
/usr/bin/brave-browser
/snap/bin/brave
/usr/bin/vivaldi
/usr/bin/opera
/var/lib/flatpak/exports/bin/org.chromium.Chromium
/var/lib/flatpak/exports/bin/com.brave.Browser
```

---

## Section 6: Shell Script Parity Gaps (10 Scripts Without `.ps1`)

| Script | Priority | Reason |
|--------|----------|--------|
| `release-stable.sh` | LOW | Internal release workflow, not user-facing |
| `release-preflight.sh` | LOW | Internal release workflow |
| `release-version.sh` | LOW | Internal release workflow (uses `BASH_REMATCH`) |
| `ctx-agent.sh` | LOW | 5-line bootstrapper, trivial to port |
| `install-codemap.sh` | LOW | Thin wrapper to `aios.sh` |
| `doctor-codemap.sh` | LOW | Thin wrapper to `aios.sh` |
| `growth-daily-metrics.sh` | LOW | Analytics utility, limited audience |
| `growth-daily-report.sh` | LOW | Analytics utility |
| `growth-daily-review.sh` | LOW | Analytics utility |
| `cta-experiment-log.sh` | LOW | Analytics utility |

All 10 are either internal tools or thin wrappers. None are needed for end-user installation or MCP server operation.

---

## Section 7: Positive Findings (Already Correct)

- **Windows command resolution** (`process.mjs`): PATHEXT, PATH, `.cmd`/`.bat`/`.ps1` — best-in-class implementation
- **Symlink operations** (`fs.mjs`, `skills.mjs`): `junction` on Windows, `dir` on POSIX — correct everywhere
- **Venv paths** (`resolveVenvPythonPath`): `.venv\Scripts\python.exe` on Windows — already implemented
- **MCP launcher selection** (`resolveLauncherScript`): `.ps1` vs `.sh` — implemented in this audit session
- **Browser open command** (`contextdb/cli.ts`): `open`/`cmd`/`xdg-open` — correct ternary
- **CI** (`windows-shell-smoke.yml`): Windows smoke test exists on `windows-latest`

---

## Section 8: Action Priority Matrix

| # | Issue | Severity | Effort | File |
|---|-------|----------|--------|------|
| 1 | Replace `python3` in `aios-cred.mjs` with `uv run` | HIGH | Small | `aios-cred.mjs` |
| 2 | Fix `doctorBrowserMcp` venv path | MEDIUM | Tiny | `browser.mjs:833` |
| 3 | Add Brave/Arc/Canary browser paths | MEDIUM | Small | `launcher.ts` |
| 4 | Fix `HOME` without `USERPROFILE` in `browser.mjs` | CRITICAL | Tiny | `browser.mjs:493` |
| 5 | Fix `HOME` without `USERPROFILE` in `self-update.mjs` | HIGH | Tiny | `self-update.mjs` |
| 6 | Add `security` guard in MCP launcher `.sh` | HIGH | Tiny | `run-browser-use-mcp.sh` |
| 7 | Remove legacy `python -m venv` fallback | LOW | Small | `browser.mjs:291-296` |
| 8 | CDP service cross-platform (systemd/nssm) | CRITICAL | Large | `browser.mjs` |
| 9 | Shell rc detection for `.bashrc` | MEDIUM | Medium | Multiple |
| 10 | Credential backends for Linux/Windows | HIGH | Large | `credentials.py` |

---

## Section 9: Verification

- [ ] `npm run typecheck` (mcp-server) — passes
- [ ] `npm run test:scripts` — 563/564 pass (1 pre-existing CHANGELOG issue)
- [ ] `node --test scripts/tests/aios-components.test.mjs` — 27/27 pass including Windows-specific tests
- [ ] CI `windows-shell-smoke.yml` — runs on `windows-latest`, should be extended with MCP config validation


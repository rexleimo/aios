# AIOS Releases + One-Liner Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship GitHub Releases artifacts + stable one-liner installers that install to `~/.rexcil/aios`, and update docs so `aios` is the single interactive entry.

**Architecture:** Build a deterministic release bundle (`aios.tar.gz`, `aios.zip`) that excludes user state (profiles/context-db), publish via a tag-triggered workflow, and provide two tiny installer scripts (`aios-install.sh` / `aios-install.ps1`) that fetch `releases/latest` and run shell integration so `aios` opens the TUI by default.

**Tech Stack:** Bash, PowerShell, GitHub Actions, existing AIOS install/update scripts.

---

### Task 1: Package script (release bundle)

**Files:**
- Create: `scripts/package-release.sh`
- Create: `scripts/package-release.ps1`

**Step 1: Define deterministic output names**
- Output directory (default): `dist/release/`
- Files:
  - `dist/release/aios.tar.gz` (macOS/Linux)
  - `dist/release/aios.zip` (Windows)
  - `dist/release/aios-install.sh`
  - `dist/release/aios-install.ps1`

**Step 2: Build staging tree with a single top folder**
- Staging path: `<tmp>/rex-cli/`
- Copy repo files into staging while excluding:
  - `.git/`
  - `**/node_modules/`
  - `mcp-server/dist/` (generated; rebuild in workflow and copy fresh if desired)
  - `.browser-profiles/`, `mcp-server/.browser-profiles/`
  - `mcp-server/.pw-home/`
  - `temp/`
  - `memory/context-db/`
  - `site/` (built docs)

**Step 3: Produce archives**
- `tar -czf aios.tar.gz aios`
- `zip -r aios.zip aios`

**Step 4: Smoke run locally**
Run:
```bash
scripts/package-release.sh --out dist/release
ls -la dist/release
```
Expected: all 4 files exist.

---

### Task 2: One-liner installers (Releases-first)

**Files:**
- Create: `scripts/aios-install.sh`
- Create: `scripts/aios-install.ps1`

**Step 1: Default repo + install dir**
- Repo: `rexleimo/aios` (override via env `AIOS_REPO`)
- Install dir: `~/.rexcil/aios` (override via env `AIOS_INSTALL_DIR`)
- Download URLs:
  - `https://github.com/$AIOS_REPO/releases/latest/download/aios.tar.gz`
  - `https://github.com/$AIOS_REPO/releases/latest/download/aios.zip`

**Step 2: Preserve user state on upgrade**
Preserve if present:
- `.browser-profiles/`
- `mcp-server/.browser-profiles/`
- `memory/context-db/`
- `config/browser-profiles.json`

**Step 3: Install shell integration**
After extracting:
- macOS/Linux: run `scripts/install-contextdb-shell.sh --mode opt-in --force`
- Windows: run `scripts/install-contextdb-shell.ps1 -Mode opt-in -Force`

**Step 4: Print next steps**
- `source ~/.zshrc` or `. $PROFILE`
- Run `aios` (launches TUI)

---

### Task 3: GitHub Actions workflow for Releases

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Trigger**
- On `push` tags `v*`
- Manual `workflow_dispatch`

**Step 2: Build + package**
- `cd mcp-server && npm ci && npm run typecheck && npm run build`
- `scripts/package-release.sh --out dist/release`

**Step 3: Publish Release assets**
- Use `softprops/action-gh-release@v2`
- Upload `dist/release/*`
- Enable `generate_release_notes: true`

---

### Task 4: Make `aios` (no args) open the TUI

**Files:**
- Modify: `scripts/contextdb-shell.zsh`
- Modify: `scripts/contextdb-shell.ps1`

**Step 1: Default behavior**
- `aios` (no args) -> run `$ROOTPATH/scripts/aios.sh` / `$ROOTPATH/scripts/aios.ps1`
- Keep subcommands:
  - `aios doctor`
  - `aios update`
  - `aios privacy ...`

---

### Task 5: Update docs library (docs-site)

**Files:**
- Modify: `docs-site/getting-started.md`
- Modify: `docs-site/zh/getting-started.md`

**Step 1: Add A/B/C install routes**
- A) `git clone` to `~/.rexcil/aios`
- B) Download from Releases (`aios.tar.gz` / `aios.zip`)
- C) One-liner installers (`aios-install.sh` / `aios-install.ps1`, recommended)

**Step 2: Promote the unified entry**
- After install + source profile: `aios` launches TUI
- Mention direct entry without shell integration:
  - `scripts/aios.sh` / `scripts/aios.ps1`

---

### Task 6: Verification

**Commands:**
- `scripts/verify-aios.sh --strict`
- Optional docs build:
  - `python -m pip install -r docs-requirements.txt`
  - `mkdocs build --strict -f mkdocs.yml`


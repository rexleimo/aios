# Release Installer Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub Releases the working stable installation channel for `Harness CLI`, so `releases/latest/download/aios-install.sh` and related assets resolve after an official versioned release.

**Architecture:** Tighten the release workflow around semver tags, add explicit version/tag/changelog consistency checks, define one supported development install path (`git clone main`), and document a maintainer release flow that reliably publishes installer assets to GitHub Releases.

**Tech Stack:** GitHub Actions, Bash/PowerShell release scripts, docs-site/README docs, `node:test` plus shell verification commands

---

### Task 1: Lock the target release contract in tests or script checks

**Files:**
- Create: `scripts/tests/release-pipeline.test.mjs`
- Modify: `scripts/package-release.sh`
- Modify: `scripts/release-version.sh`

- [ ] **Step 1: Write a failing test that asserts the package step produces all four required stable assets**
- [ ] **Step 2: Write a failing test or script-level check for `VERSION` and tag/changelog consistency parsing**
- [ ] **Step 3: Run `node --test scripts/tests/release-pipeline.test.mjs` and verify failure for the missing release consistency behavior**

### Task 2: Enforce tag-based stable release publication

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/package-release.sh`
- Modify: `scripts/package-release.ps1`

- [ ] **Step 1: Remove unrestricted stable publishing from `workflow_dispatch`, or gate it behind an explicit semver tag input resolved to that exact tag**
- [ ] **Step 2: Add workflow preflight checks that fail if tag name, `VERSION`, and changelog release heading do not match**
- [ ] **Step 3: Ensure release packaging always uploads `aios-install.sh`, `aios-install.ps1`, `rex-cli.tar.gz`, and `rex-cli.zip`**
- [ ] **Step 4: Re-run focused release pipeline tests and local packaging verification**

### Task 3: Add a maintainer release helper flow

**Files:**
- Create: `scripts/release-stable.sh`
- Create: `scripts/release-stable.ps1`
- Modify: `README.md`
- Modify: `README-zh.md`

- [ ] **Step 1: Write a failing test or dry-run check for a helper that computes `vX.Y.Z` from `VERSION`**
- [ ] **Step 2: Implement a minimal helper that verifies clean state, validates `VERSION` and changelog alignment, creates tag `vX.Y.Z`, and prints/pushes the exact commands**
- [ ] **Step 3: Document that the tag must be created from the committed version-bump commit**
- [ ] **Step 4: Verify the helper in dry-run mode without mutating repo history**

### Task 4: Split stable install docs from development install docs

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `docs-site/getting-started.md`
- Modify: `docs-site/zh/getting-started.md`
- Modify: `docs-site/ja/getting-started.md`
- Modify: `docs-site/ko/getting-started.md`
- Modify: `docs-site/index.md`
- Modify: `docs-site/zh/index.md`
- Modify: `docs-site/ja/index.md`
- Modify: `docs-site/ko/index.md`
- Modify: `docs-site/changelog.md`

- [ ] **Step 1: Update stable install docs to state that GitHub Releases are the canonical stable path**
- [ ] **Step 2: Add one clearly labeled development install path based only on `git clone main`**
- [ ] **Step 3: Remove any wording that implies `main`-based install is equivalent to a stable release**
- [ ] **Step 4: Re-read affected docs and confirm stable-vs-development wording is consistent across languages touched in this pass**

### Task 5: Prepare and verify the first real release runbook

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs-site/changelog.md`
- Create: `docs/plans/2026-03-17-release-first-run-checklist.md`

- [ ] **Step 1: Write a first-release checklist covering version bump, commit, tag, push, workflow completion, asset URL checks, and install smoke verification**
- [ ] **Step 2: Include both version-specific asset URLs and `latest` asset URLs in the checklist**
- [ ] **Step 3: Include a post-install version check so the installer payload version is verified, not just the download URL**

### Task 6: Final verification

**Files:**
- Test: `scripts/tests/release-pipeline.test.mjs`
- Test: `scripts/tests/aios-cli.test.mjs`
- Test: `scripts/tests/skills-component.test.mjs`
- Verify: `.github/workflows/release.yml`

- [ ] **Step 1: Run `node --test scripts/tests/release-pipeline.test.mjs`**
- [ ] **Step 2: Run `node --test scripts/tests/aios-cli.test.mjs scripts/tests/skills-component.test.mjs` to confirm unrelated lifecycle behavior still passes**
- [ ] **Step 3: Run `scripts/package-release.sh --out dist/release-smoke` and verify all required files exist**
- [ ] **Step 4: If the implementation includes a dry-run release helper, run it and confirm the computed tag matches `VERSION`**
- [ ] **Step 5: Record the exact first stable release commands in the final handoff**

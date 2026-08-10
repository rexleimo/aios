# Windows AIOS Patch Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the next patch release for the Windows AIOS PowerShell wrapper fix.

**Architecture:** Keep the fix minimal in the PowerShell shell wrapper, add a regression test for single-option forwarding, and enforce LF frontmatter for canonical skills so Windows CI can run strict parser tests. Release assets are produced by the existing tag-triggered GitHub workflow.

**Tech Stack:** PowerShell, Node.js test runner, shell release scripts, GitHub Actions release workflow.

---

### Task 1: Verify Windows wrapper fix

**Files:**
- Modify: `scripts/contextdb-shell.ps1`
- Test: `scripts/tests/aios-wrappers.test.mjs`

- [ ] Run: `node --test scripts/tests/aios-wrappers.test.mjs`
- [ ] Run: `aios memo --help`
- [ ] Run: `aios init --help`

### Task 2: Unblock Windows script tests

**Files:**
- Create: `.gitattributes`
- Normalize: `skill-sources/**/SKILL.md`
- Test: `scripts/tests/skills-frontmatter.test.mjs`

- [ ] Add `skill-sources/**/SKILL.md text eol=lf`.
- [ ] Run: `node --test scripts/tests/skills-frontmatter.test.mjs`.
- [ ] Run: `npm run test:scripts`.

### Task 3: Version and release

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`

- [ ] Run: `bash scripts/release-version.sh patch "fix(windows): preserve AIOS PowerShell wrapper arguments"`.
- [ ] Run: `bash scripts/release-stable.sh --dry-run --allow-dirty`.
- [ ] Package assets with `bash scripts/package-release.sh --out dist/release-check`.
- [ ] Verify these assets exist: `aios.tar.gz`, `aios.zip`, `aios-install.sh`, `aios-install.ps1`.
- [ ] Commit, push `main`, tag `vX.Y.Z`, and push the tag to trigger `.github/workflows/release.yml`.
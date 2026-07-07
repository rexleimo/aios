# Home Multi-Device Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the home page responsive contract so desktop, tablet, and mobile states align with the approved Pencil layouts and no narrow-screen overflow remains.

**Architecture:** Keep the existing home markup and WebGL sections intact while tightening the shell/header breakpoints and the home section CSS contract. Add regression tests first, then make the smallest CSS changes needed to satisfy them.

**Tech Stack:** MkDocs content templates, static CSS, Node test runner, Playwright screenshot verification

## Global Constraints
- Preserve desktop hero left/right behavior.
- Tablet must collapse into the approved stacked home layout.
- Mobile must not horizontally overflow or leave a blank right-side gutter.
- Follow TDD: tests fail first, then minimal CSS changes.

---

### Task 1: Lock the responsive contract in tests

**Files:**
- Modify: `scripts/tests/site-redesign-responsive.test.mjs`
- Test: `scripts/tests/site-redesign-responsive.test.mjs`

**Interfaces:**
- Consumes: Existing CSS contracts in `docs-site/assets/redesign/home.css` and `docs-site/assets/redesign/shell.css`
- Produces: Failing regression expectations for tablet/mobile home shell and hero sizing behavior

- [ ] Add a failing test for the home shell header collapse at tablet/mobile widths.
- [ ] Add a failing test for the narrow-screen hero visual sizing contract.
- [ ] Run the targeted responsive test file and confirm the new assertions fail for the expected reasons.

### Task 2: Implement the minimal responsive CSS fixes

**Files:**
- Modify: `docs-site/assets/redesign/shell.css`
- Modify: `docs-site/assets/redesign/home.css`
- Test: `scripts/tests/site-redesign-responsive.test.mjs`

**Interfaces:**
- Consumes: The failing responsive tests from Task 1
- Produces: Updated shell and home CSS that match the 3-state responsive contract

- [ ] Hide desktop nav links and rebalance the topbar grid for tablet/mobile shells.
- [ ] Reduce narrow-screen hero visual overflow and tighten tablet/mobile spacing where required.
- [ ] Keep existing desktop rules intact unless a regression test proves otherwise.

### Task 3: Verify with tests, build, and screenshots

**Files:**
- Modify: none expected
- Test: `scripts/tests/site-redesign-responsive.test.mjs`, `scripts/tests/site-redesign-assets.test.mjs`

**Interfaces:**
- Consumes: Updated CSS and test coverage from Tasks 1-2
- Produces: Verification evidence for responsive behavior across target device widths

- [ ] Run targeted site redesign tests until green.
- [ ] Run a strict MkDocs build.
- [ ] Capture fresh 1366 / 768 / 375 screenshots and compare them against the approved Pencil states.

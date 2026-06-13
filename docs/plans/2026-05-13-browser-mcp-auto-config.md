# Browser MCP Auto-Configuration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make browser MCP setup automatically discover the local `ai-browser-book` checkout and write the generated MCP config back into the repo/client config files.

**Architecture:** Keep the existing launcher/bootstrap discovery logic, but make `installBrowserMcp` perform the config migration as part of a successful install. The migration should write only the `mcp-browser-use` alias, update launcher/env paths when a local checkout is found, and preserve warning-only behavior when the checkout is still missing.

**Tech Stack:** TypeScript, Node.js, Bash, Python, JSON config files

---

### Task 1: Auto-write browser MCP config after install

**Files:**
- Modify: `scripts/lib/components/browser.mjs`
- Modify: `scripts/tests/aios-components.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('browser install auto-writes MCP configs from adjacent ai-browser-book checkout', async () => {
  // Arrange a temp root with scripts/, config/, and ai-browser-book/mcp-browser-use/pyproject.toml.
  // Call installBrowserMcp({ rootDir, skipPlaywrightInstall: true, io: { log: () => {} } }).
  // Assert .mcp.json and mcp-server/.mcp.json now reference scripts/run-browser-use-mcp.sh.
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `node --test scripts/tests/aios-components.test.mjs`
Expected: the new auto-config test fails because installBrowserMcp does not write MCP config yet.

- [ ] **Step 3: Implement the minimal change**

```js
// In installBrowserMcp, after validating the browser-use repo and runtime,
// call migrateBrowserMcpConfig({ rootDir, io, dryRun, clientHomes }).
// Return the migration result alongside the launcher details.
```

- [ ] **Step 4: Re-run the targeted test**

Run: `node --test scripts/tests/aios-components.test.mjs`
Expected: the new auto-config test passes and existing browser tests remain green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/components/browser.mjs scripts/tests/aios-components.test.mjs docs/plans/2026-05-13-browser-mcp-auto-config.md
git commit -m "feat(browser): auto-configure browser mcp on install"
```

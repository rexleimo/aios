// scripts/lib/components/browser/runtime-readiness.mjs — browser MCP runtime readiness.
// Single owner of the question "can this AIOS root actually serve browser MCP?".
// Callers that want to advertise a browser server to a client (the Pi-global
// mcp.json) ask here instead of re-deriving browser paths on their own.
import fs from 'node:fs';
import path from 'node:path';

import { resolveLocalBrowserMcpScript } from './runtime-paths.mjs';

// Same three facts `aios internal browser doctor` reports as "local browser
// runtime": the launcher script, the mcp-server package, and the installed
// Playwright dependency. A missing CDP profile is deliberately NOT a blocker —
// without one the runtime launches its own local Chromium, which is the
// supported default; CDP only matters for attaching to an external browser.
export function isBrowserMcpRuntimeInstalled({ rootDir = '', existsSync = fs.existsSync } = {}) {
  const root = String(rootDir || '').trim();
  if (!root) return false;
  return existsSync(resolveLocalBrowserMcpScript(root))
    && existsSync(path.join(root, 'mcp-server', 'package.json'))
    && existsSync(path.join(root, 'mcp-server', 'node_modules', 'playwright', 'package.json'));
}

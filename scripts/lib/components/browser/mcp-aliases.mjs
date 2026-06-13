import { PRIMARY_BROWSER_ALIAS } from './constants.mjs';

export const LEGACY_BROWSER_ALIASES = ['puppeteer-stealth', 'playwright-browser-mcp'];
export const BROWSER_MCP_ALIASES = [PRIMARY_BROWSER_ALIAS, ...LEGACY_BROWSER_ALIASES];

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function findFirstBrowserServerEntry(serverMap) {
  if (!isObjectRecord(serverMap)) {
    return null;
  }

  for (const alias of BROWSER_MCP_ALIASES) {
    const entry = serverMap[alias];
    if (isObjectRecord(entry)) {
      return entry;
    }
  }

  return null;
}

export function removeBrowserServerEntries(serverMap) {
  if (!isObjectRecord(serverMap)) {
    return;
  }

  for (const alias of BROWSER_MCP_ALIASES) {
    delete serverMap[alias];
  }
}

export function removeLegacyBrowserServerEntries(serverMap) {
  if (!isObjectRecord(serverMap)) {
    return;
  }

  for (const alias of LEGACY_BROWSER_ALIASES) {
    delete serverMap[alias];
  }
}

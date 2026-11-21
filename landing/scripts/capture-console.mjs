// Capture screenshots of the CURRENT AIOS Console (running via aios-ui.mjs).
// Exchanges the bootstrap token for a cookie, then visits the real pages.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/design-references/console');
fs.mkdirSync(OUT, { recursive: true });
const BOOT = process.env.BOOT_URL;
if (!BOOT) throw new Error('set BOOT_URL to the /t/<token>/ URL from aios-ui.mjs');
const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BOOT, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log('after bootstrap:', page.url());

  const routes = ['/', '/routing', '/routing/config', '/memory', '/settings', '/mcp', '/tools', '/activity', '/gateway'];
  for (const r of routes) {
    try {
      const resp = await page.goto('http://127.0.0.1:4300' + r, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1200);
      const title = await page.title();
      const h1 = await page.locator('h1').first().textContent().catch(() => '');
      const slug = r === '/' ? 'home' : r.replace(/\//g, '_').replace(/^_/, '');
      await page.screenshot({ path: path.join(OUT, `console-${slug}.png`), fullPage: true });
      console.log(`${r} -> ${resp?.status()} | title=${title} | h1=${(h1 || '').trim().slice(0, 40)} | final=${page.url()}`);
    } catch (e) {
      console.log(`${r} -> ERROR ${e.message.slice(0, 80)}`);
    }
  }
  await ctx.close();
} finally { await browser.close(); }
console.log('capture done');

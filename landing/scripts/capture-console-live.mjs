// Capture 1440x900 viewport screenshots of the CURRENT AIOS Console.
// One shot per page at top, plus a focused gateway-flow shot scrolled into view.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'landing/assets/media/aios');
fs.mkdirSync(OUT, { recursive: true });
const BOOT = process.env.BOOT_URL;
if (!BOOT) throw new Error('set BOOT_URL');
const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = 'http://127.0.0.1:4300';

const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BOOT, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  const pages = [
    ['home', '/'],
    ['gateway', '/routing'],
    ['tools', '/tools'],
    ['memory', '/memory'],
    ['resources', '/mcp'],
    ['activity', '/activity'],
  ];
  for (const [name, route] of pages) {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, `live-${name}.png`) });
    console.log('captured', name, route);
  }

  // Gateway flow diagram: scroll down from /routing until the svg/flow is in view.
  await page.goto(BASE + '/routing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 430));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'live-gateway-flow.png') });
  console.log('captured gateway-flow');

  await ctx.close();
} finally { await browser.close(); }
console.log('done');

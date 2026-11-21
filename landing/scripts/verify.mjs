// Local verification: load the clone, report failed requests / console errors,
// and capture desktop + mobile screenshots for visual diff against the reference.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/design-references');
const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const URL = process.env.CLONE_URL || 'http://127.0.0.1:8899/';
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
try {
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const errors = [], failed = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message.slice(0, 200)));
    page.on('requestfailed', r => failed.push(r.url().slice(0, 160) + ' :: ' + r.failure()?.errorText));
    const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    // Mirror the reference capture sequence so time-driven demos settle the same way.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(600);
    const stats = await page.evaluate(() => ({
      title: document.title,
      imgs: document.querySelectorAll('img').length,
      brokenImgs: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0,160)),
      scrollH: document.documentElement.scrollHeight,
      h1: document.querySelector('h1')?.innerText,
      theme: document.documentElement.getAttribute('data-theme'),
    }));
    await page.screenshot({ path: path.join(OUT, `clone-${vp.name}.png`), fullPage: true });
    console.log(JSON.stringify({ vp: vp.name, status: resp?.status(), stats, errors, failed }, null, 2));
    await page.close();
  }
} finally { await browser.close(); }

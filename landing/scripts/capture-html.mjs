// Capture the fully-rendered document HTML for a faithful local reconstruction.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('https://usemagpie.ai/zh/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { for (const i of document.querySelectorAll('img[loading="lazy"]')) i.loading = 'eager'; });
  await page.waitForTimeout(1500);
  const html = await page.content();
  fs.writeFileSync(path.join(ROOT, 'docs/research/reference-full.html'), html);
  console.log('captured bytes=', html.length);
} finally { await browser.close(); }

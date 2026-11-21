// Interaction + behavior sweep and raw CSS capture.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/research');
const SHOTS = path.join(ROOT, 'docs/design-references/sections');
const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('https://usemagpie.ai/zh/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);

  report.head = await page.evaluate(() => ({
    links: [...document.querySelectorAll('link')].map(l => ({ rel: l.rel, href: l.href, media: l.media })),
    metas: [...document.querySelectorAll('meta')].map(m => ({ name: m.name||m.getAttribute('property'), content: m.content })).slice(0,30),
    styles: [...document.querySelectorAll('style')].map(s => s.textContent),
    scripts: [...document.querySelectorAll('script')].map(s => ({ src: s.src, inline: s.src ? null : s.textContent.slice(0,20000) })),
  }));
  fs.writeFileSync(path.join(OUT, 'head-capture.json'), JSON.stringify(report.head, null, 2));

  // RECEIVE initial state
  const themeState = () => page.evaluate(() => ({
    cls: document.documentElement.className,
    theme: document.documentElement.getAttribute('data-theme'),
    scheme: matchMedia('(prefers-color-scheme: dark)').matches,
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
  }));
  report.themeInitial = await themeState();
  await page.locator('button.theme').first().click();
  await page.waitForTimeout(400);
  report.themeAfterClick = await themeState();
  await page.screenshot({ path: path.join(SHOTS, 'magpie-theme-click.png'), fullPage: false });
  // click again
  await page.locator('button.theme').first().click();
  await page.waitForTimeout(400);
  report.themeAfterClick2 = await themeState();

  // ROUTING TABS
  await page.locator('#routing').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const tabs = page.locator('#rt .tabs button, #rt button');
  report.routingTabCount = await tabs.count();
  report.routingTabsBefore = await tabs.allTextContents().catch(()=>[]);
  await page.screenshot({ path: path.join(SHOTS, 'magpie-routing-tab-before.png'), fullPage: false });
  if (report.routingTabCount > 1) {
    await tabs.nth(1).click();
    await page.waitForTimeout(500);
    report.routingAfterClick = await page.locator('#rt').evaluate(n => n.innerText.slice(0,3000));
    await page.screenshot({ path: path.join(SHOTS, 'magpie-routing-tab-after.png'), fullPage: false });
  }

  // NAV scroll behavior
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  report.navAtTop = await page.locator('#nav').evaluate(n => { const s=getComputedStyle(n); const r=n.getBoundingClientRect(); return {bg:s.backgroundColor, border:s.borderBottom, shadow:s.boxShadow, top:r.top, h:r.height}; });
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  report.navAtScroll = await page.locator('#nav').evaluate(n => { const s=getComputedStyle(n); const r=n.getBoundingClientRect(); return {bg:s.backgroundColor, border:s.borderBottom, shadow:s.boxShadow, top:r.top, h:r.height}; });

  // HOVER states (nav link + primary button)
  await page.evaluate(() => window.scrollTo(0, 0));
  const link = page.locator('#links a').first();
  report.hoverBefore = await link.evaluate(n => { const s=getComputedStyle(n); return {color:s.color, textDecoration:s.textDecoration}; });
  await link.hover();
  await page.waitForTimeout(300);
  report.hoverAfter = await link.evaluate(n => { const s=getComputedStyle(n); return {color:s.color, textDecoration:s.textDecoration}; });

  await page.close();

  // MOBILE menu
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await m.goto('https://usemagpie.ai/zh/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await m.waitForTimeout(800);
  report.mobileMenuBefore = await m.locator('#links').evaluate(n => { const s=getComputedStyle(n); return {display:s.display, opacity:s.opacity, transform:s.transform}; }).catch(()=>null);
  const menuBtn = m.locator('button.theme.menu').first();
  if (await menuBtn.count()) {
    await menuBtn.click();
    await m.waitForTimeout(400);
    report.mobileMenuAfter = await m.locator('#links').evaluate(n => { const s=getComputedStyle(n); return {display:s.display, opacity:s.opacity, transform:s.transform}; }).catch(()=>null);
    await m.screenshot({ path: path.join(SHOTS, 'magpie-mobile-menu.png'), fullPage: false });
  }
  await m.close();
} finally { await browser.close(); }
fs.writeFileSync(path.join(OUT, 'behaviors.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2).slice(0, 6000));

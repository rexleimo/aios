// Per-section extraction: outerHTML, computed styles, verbatim text, and screenshots.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/design-references/sections');
const RESEARCH = path.join(ROOT, 'docs/research');
const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const SECTIONS = [
  ['nav', '#nav'],
  ['hero', 'header.hero'],
  ['sponsor', 'aside.sponsor'],
  ['agents', 'div.agents'],
  ['how', 'section#how'],
  ['masking', 'section#masking'],
  ['subscriptions', 'section#subscriptions'],
  ['routing', 'section#routing'],
  ['providers', 'section#providers'],
  ['features', 'section#features'],
  ['cli', 'section#cli'],
  ['final', 'div.final'],
  ['footer', 'footer'],
];

const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('https://usemagpie.ai/zh/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // Force lazy images to load
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const result = {};
  for (const [name, selector] of SECTIONS) {
    const el = page.locator(selector).first();
    if (await el.count() === 0) { console.log('MISSING', name); continue; }
    result[name] = await el.evaluate((node) => {
      const cs = (e) => {
        const s = getComputedStyle(e);
        const p = ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor',
          'padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginBottom',
          'width','height','maxWidth','display','flexDirection','alignItems','justifyContent','gap',
          'gridTemplateColumns','border','borderRadius','boxShadow','position','top','left','zIndex','opacity',
          'transform','textAlign','whiteSpace','overflow'];
        const o = {};
        for (const k of p) { const v = s[k]; if (v && v!=='none'&&v!=='normal'&&v!=='auto'&&v!=='0px'&&v!=='rgba(0, 0, 0, 0)') o[k]=v; }
        return o;
      };
      const walk = (e, d=0) => {
        if (!e || d>4) return null;
        const tag = e.tagName?.toLowerCase();
        if (!tag || ['SCRIPT','STYLE','NOSCRIPT'].includes(tag)) return null;
        return { tag, cls: (typeof e.className==='string'?e.className:'').slice(0,120),
          text: e.childNodes.length===1 && e.childNodes[0].nodeType===3 ? e.textContent.trim().slice(0,200):undefined,
          style: cs(e),
          children: [...e.children].slice(0,40).map(c=>walk(c,d+1)).filter(Boolean) };
      };
      return {
        html: node.outerHTML.slice(0, 60000),
        text: (node.innerText || node.textContent).replace(/[ \t]+/g,' ').slice(0, 12000),
        selfStyle: cs(node),
        tree: walk(node, 0),
        rect: (() => { const r=node.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)}; })(),
      };
    });
    try { await el.screenshot({ path: path.join(OUT, `magpie-${name}.png`) }); } catch(e) { console.log('shot fail', name, e.message); }
    console.log('captured', name, result[name].rect);
  }
  fs.writeFileSync(path.join(RESEARCH, 'detail-desktop.json'), JSON.stringify(result, null, 2));
  await page.close();
} finally { await browser.close(); }
console.log('detail done');

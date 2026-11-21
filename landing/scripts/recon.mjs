// Reconnaissance for the magpie reference page.
// Uses Playwright (installed in mcp-server) to capture deterministic desktop/mobile
// screenshots and dump structural/style evidence used to write component specs.
import { chromium } from '../../mcp-server/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = 'https://usemagpie.ai/zh/';
const OUT = path.join(ROOT, 'docs/design-references');
const RESEARCH = path.join(ROOT, 'docs/research');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const extractor = () => {
  const cs = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const props = [
      'fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color',
      'backgroundColor','backgroundImage','padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
      'margin','marginTop','marginBottom','width','height','maxWidth','minHeight',
      'display','flexDirection','alignItems','justifyContent','gap',
      'gridTemplateColumns','border','borderRadius','boxShadow','position','top','left','right','bottom',
      'zIndex','opacity','transform','overflow','textAlign','whiteSpace'
    ];
    const out = {};
    for (const p of props) {
      const v = s[p];
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') out[p] = v;
    }
    return out;
  };
  const compact = (el, depth = 0) => {
    if (!el || depth > 6) return null;
    const tag = el.tagName?.toLowerCase();
    if (!tag || ['SCRIPT','STYLE','NOSCRIPT'].includes(tag)) return null;
    const ownText = [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 300);
    return {
      tag,
      id: el.id || undefined,
      cls: (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0,6).join(' ') || undefined,
      text: ownText || undefined,
      style: cs(el),
      img: tag === 'IMG' ? { src: el.src, alt: el.alt, w: el.naturalWidth, h: el.naturalHeight } : undefined,
      children: [...el.children].slice(0, 60).map(c => compact(c, depth + 1)).filter(Boolean),
    };
  };

  const body = document.body;
  const imgs = [...document.querySelectorAll('img')].map(i => ({
    src: i.currentSrc || i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight,
    loading: i.loading, parentCls: i.parentElement?.className?.toString().slice(0,80)
  }));
  const bgImgs = [...document.querySelectorAll('*')].map(el => {
    const b = getComputedStyle(el).backgroundImage;
    return b && b !== 'none' ? { el: el.tagName.toLowerCase() + '.' + (el.className?.toString().slice(0,60)||''), bg: b.slice(0,300) } : null;
  }).filter(Boolean);
  const svgs = [...document.querySelectorAll('svg')].map((s, i) => ({
    i, outer: s.outerHTML.slice(0, 1200),
    cls: s.getAttribute('class'), w: s.getAttribute('width'), h: s.getAttribute('height'),
    viewBox: s.getAttribute('viewBox')
  }));

  const fonts = new Set();
  const colors = new Set();
  for (const el of [...document.querySelectorAll('*')].slice(0, 600)) {
    const s = getComputedStyle(el);
    if (s.fontFamily) fonts.add(s.fontFamily);
    if (s.color) colors.add(s.color);
    if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(s.backgroundColor);
  }

  return {
    title: document.title,
    url: location.href,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollH: document.documentElement.scrollHeight },
    fonts: [...fonts],
    colors: [...colors],
    images: imgs,
    backgroundImages: bgImgs,
    svgCount: svgs.length,
    svgs: svgs.slice(0, 40),
    videos: [...document.querySelectorAll('video')].map(v => ({ src: v.src, poster: v.poster, autoplay: v.autoplay, loop: v.loop, muted: v.muted })),
    links: [...document.querySelectorAll('link[rel*="icon"], link[rel="preconnect"]')].map(l => ({ rel: l.rel, href: l.href })),
    skeleton: compact(body, 0),
  };
};

const CHROME = '/Users/rex/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(CHROME) ? CHROME : chromium.executablePath() });
try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await page.waitForTimeout(1000);
      }
    }
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `magpie-${vp.name}.png`), fullPage: true });
    const data = await page.evaluate(extractor);
    fs.writeFileSync(path.join(RESEARCH, `extract-${vp.name}.json`), JSON.stringify(data, null, 2));
    console.log(`[${vp.name}] viewport=${JSON.stringify(data.viewport)} imgs=${data.images.length} svgs=${data.svgCount} bgs=${data.backgroundImages.length} fonts=${data.fonts.length} colors=${data.colors.length}`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('recon done');

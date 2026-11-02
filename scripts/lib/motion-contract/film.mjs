// Films a page and reports the two frame-level facts that cannot be read off
// the source: a one-frame step (a snap) and neighbours gliding on different
// curves (drift). The recording and the measurement come from the vendored
// upstream cores, so this file is transport and reporting only.
//
// Distinct from check-motion-contract.mjs on purpose: that one reads
// declarations and misses a 4px step; this one measures geometry while the
// page runs. Measured 2026-11-02 on the same CSS: the declaration gate exits 0
// on a single-frame 4px snap that this reports.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VENDOR_SCRIPTS = path.join('vendor', 'stageshow', 'scripts');

async function importVendored(root) {
  const core = path.join(root, VENDOR_SCRIPTS, 'jumps-core.mjs');
  if (!fs.existsSync(core)) {
    throw new Error(
      `vendored frame core missing at ${core}: run \`node scripts/check-motion-kit.mjs\` and restore it before filming`,
    );
  }
  return import(pathToFileURL(core).href);
}

// Deliberately a search, not an install: the repository has no root Playwright
// dependency and this must not add one. The search order is reported so a
// failing run says where it looked instead of "cannot find module".
async function resolvePlaywright(root) {
  const candidates = [
    path.join(root, 'node_modules', 'playwright-core'),
    path.join(root, 'mcp-server', 'node_modules', 'playwright-core'),
    'playwright-core',
  ];
  const tried = [];
  for (const candidate of candidates) {
    try {
      // Only an absolute directory is imported by path; a bare specifier has to
      // stay a specifier so Node resolves it through node_modules. Passing a
      // bare name through pathToFileURL is what produced the earlier
      // ERR_UNSUPPORTED_ESM_URL_SCHEME in the extracted package.
      const mod = path.isAbsolute(candidate)
        ? await import(pathToFileURL(path.join(candidate, 'index.js')).href)
        : await import(candidate);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium) throw new Error('module has no chromium export');
      tried.push(`${candidate}: ok`);
      return { chromium, tried };
    } catch (error) {
      tried.push(`${candidate}: ${error.code ?? error.message}`);
    }
  }
  return { chromium: null, tried };
}

function resolveBrowserExecutable(explicit) {
  if (explicit) return explicit;
  if (process.env.AIOS_FILM_BROWSER) return process.env.AIOS_FILM_BROWSER;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? undefined;
}

function sourceToUrl(source, root) {
  if (/^https?:\/\//.test(source) || source.startsWith('file:')) return source;
  const absolute = path.resolve(root, source);
  if (!fs.existsSync(absolute)) throw new Error(`no such page: ${absolute}`);
  return pathToFileURL(absolute).href;
}

// The upstream recorder was written for the stageshow kit: it skips carets,
// cursors and anything marked data-snap so intentional steps are not reported.
// Those class names (.ss-*) do not exist here, so they are mapped to this
// repository's spelling. Everything else is upstream logic untouched.
const DOM_CONVENTION_MAP = `
  const REMAP = [
    ['[data-snap]', '[data-snap]'],
    ['[data-typing]', '[data-typing]'],
    ['.ss-caret', '.motion-caret'],
    ['.ss-field__caret', '.motion-caret'],
    ['.ss-term__caret', '.motion-caret'],
    ['.ss-cursor', '.motion-cursor'],
    ['.ss-camera', '.motion-camera'],
    ['.ss-field__chars', '[data-typing]'],
    ['.ss-field__placeholder', '[data-typing]'],
    ['.ss-kb__callout', '[data-typing]'],
    ['.ss-kb__suggest', '[data-typing]'],
    ['.ss-roll', '[data-snap]'],
  ];
`;

export async function filmPage(options) {
  const { root, source, selector = 'body', durationMs = 1200, width = 1280, height = 800, executablePath } = options;
  const { record, analyse } = await importVendored(root);

  const { chromium, tried } = await resolvePlaywright(root);
  if (!chromium) {
    const error = new Error(
      `no Playwright available for the frame gate; looked at: ${tried.join('; ')}. ` +
        'Install playwright-core or set AIOS_FILM_BROWSER to a Chrome binary and run `npm run check:motion:frame`.',
    );
    error.code = 'NO_PLAYWRIGHT';
    throw error;
  }

  const browser = await chromium.launch({ executablePath: resolveBrowserExecutable(executablePath) });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    const failed = [];
    const unreachable = [];
    const isFileUrl = sourceToUrl(source, root).startsWith('file:');
    page.on('pageerror', (error) => {
      if (isFileUrl && /Failed to fetch/.test(error.message)) unreachable.push(error.message);
      else failed.push(`pageerror: ${error.message}`);
    });
    // A page opened as file:// cannot reach its own http endpoints. Reporting
    // those as page errors would bury the defects this gate exists to find, so
    // they are counted separately rather than dropped.
    page.on('requestfailed', (request) => {
      const unresolvable = isFileUrl && /^file:/.test(request.url()) && /\/api\//.test(request.url());
      if (unresolvable) unreachable.push(request.url());
      else failed.push(`requestfailed: ${request.url()}`);
    });

    await page.goto(sourceToUrl(source, root), { waitUntil: 'load' });

    // Inject the upstream recorder with the class names remapped, then run it
    // for the requested window and read the frames back.
    const frames = await page.evaluate(
      async ({ recorderSource, selectorArg, duration, remap }) => {
        // eslint-disable-next-line no-new-func
        const factory = new Function(`${remap}; return (${recorderSource});`)();
        window.__frames = null;
        // The recorder stops when this flag is set, which is how the upstream
        // film harness ends a recording too.
        window.__ssVerification = { stopped: false, errors: [] };
        const stage = document.querySelector(selectorArg);
        if (!stage) throw new Error(`selector not found: ${selectorArg}`);
        factory(stage);
        await new Promise((resolve) => setTimeout(resolve, duration));
        window.__ssVerification.stopped = true;
        return { frames: window.__frames, errors: window.__ssVerification.errors };
      },
      { recorderSource: record.toString(), selectorArg: selector, duration: durationMs, remap: DOM_CONVENTION_MAP },
    );

    const findings = analyse(Array.isArray(frames.frames) ? frames.frames : []);
    const recorded = Array.isArray(frames.frames) ? frames.frames : [];
    // A clean result is only meaningful if the recorder actually saw elements.
    // An empty page, a wrong selector or a recorder that threw all report
    // "no findings", and only this count tells them apart.
    const itemCounts = recorded.map((frame) => frame.items?.length ?? 0);
    return {
      source,
      selector,
      durationMs,
      frames: recorded.length,
      measured: {
        maxItems: itemCounts.length ? Math.max(...itemCounts) : 0,
        minItems: itemCounts.length ? Math.min(...itemCounts) : 0,
        emptyFrames: itemCounts.filter((count) => count === 0).length,
      },
      recorderErrors: frames.errors ?? [],
      pageErrors: failed,
      // Same-origin calls a file:// page cannot make. Counted, not hidden, and
      // not allowed to make a measured run look broken.
      unreachableRequests: unreachable.length,
      findings,
    };
  } finally {
    await browser.close();
  }
}

export async function writeJsonReport(result, outPath) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
}

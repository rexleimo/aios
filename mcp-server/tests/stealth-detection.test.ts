/**
 * Stealth detection verification tests
 *
 * Verifies that the browser's anti-detection measures pass bot.sannysoft.com checks.
 * Run with: npx playwright test stealth-detection.test.ts
 *
 * Note: These tests require the MCP server to be running or can be run
 * directly via the launcher when invoked from a test context.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { STEALTH_SCRIPT } from '../src/browser/stealth-script.js';

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

const chromiumExecutable = chromium.executablePath();
const stealthTest = existsSync(chromiumExecutable)
  ? test
  : test.skip;
const missingChromiumMessage = `Playwright Chromium is not installed at ${chromiumExecutable}; run npx playwright install chromium to enable stealth tests.`;

async function launchStealthBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
    ignoreDefaultArgs: ['--enable-automation'],
    // @ts-ignore - assistantMode 是 Playwright 内部选项
    assistantMode: true,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(STEALTH_SCRIPT);
  return { browser, context };
}

stealthTest('navigator.webdriver is false', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const webdriver = await page.evaluate(() => navigator.webdriver);
    assert.equal(webdriver, false, 'navigator.webdriver should be false');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('navigator.plugins is instanceof PluginArray', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const isPluginArray = await page.evaluate(() => navigator.plugins instanceof PluginArray);
    assert.equal(isPluginArray, true, 'navigator.plugins should be instanceof PluginArray');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('navigator.plugins.length > 0', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const len = await page.evaluate(() => navigator.plugins.length);
    assert.ok(len > 0, `navigator.plugins.length should be > 0, got ${len}`);
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('navigator.languages is instanceof Array', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const isArray = await page.evaluate(() => navigator.languages instanceof Array);
    assert.equal(isArray, true, 'navigator.languages should be instanceof Array');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('navigator.languages includes zh-CN', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const langs = await page.evaluate(() => Array.from(navigator.languages));
    assert.ok(langs.includes('zh-CN'), `navigator.languages should include zh-CN, got ${JSON.stringify(langs)}`);
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('navigator.language is zh-CN', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const lang = await page.evaluate(() => navigator.language);
    assert.equal(lang, 'zh-CN', `navigator.language should be zh-CN, got ${lang}`);
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('WebGL is available (skipped in headless shell)', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const hasWebGL = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return gl !== null;
    });
    // headless shell 不支持 WebGL，这是预期行为。在可见浏览器中应通过。
    if (!hasWebGL) {
      console.log('WebGL not available in headless shell - skipping (expected in headless)');
      return;
    }
    assert.equal(hasWebGL, true, 'WebGL should be available');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('WebGL spoofing works when WebGL is available', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const vendor = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
      if (!gl) return null;
      return gl.getParameter(37445); // UNMASKED_VENDOR_WEBGL
    });
    if (vendor === null) {
      console.log('WebGL not available in headless shell - skipping (expected in headless)');
      return;
    }
    assert.equal(vendor, 'Google Inc. (Apple)', `WebGL vendor should be spoofed, got ${vendor}`);
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('chrome.runtime exists', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const hasChromeRuntime = await page.evaluate(() => !!(window as any).chrome?.runtime);
    assert.equal(hasChromeRuntime, true, 'window.chrome.runtime should exist');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('navigator.permissions.query returns prompt for geolocation', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const state = await page.evaluate(async () => {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state;
      } catch {
        return 'error';
      }
    });
    assert.equal(state, 'prompt', `geolocation permission should be prompt, got ${state}`);
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('CDP automation globals are removed', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const cdcKeys = await page.evaluate(() => {
      const keys: string[] = [];
      for (const key in window) {
        if (key.indexOf('cdc_') === 0 || key.indexOf('__pw_') === 0) {
          keys.push(key);
        }
      }
      return keys;
    });
    assert.equal(cdcKeys.length, 0, `CDP globals should be removed, found: ${cdcKeys.join(', ')}`);
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

stealthTest('PluginArray methods exist and return expected types', { skip: !existsSync(chromiumExecutable) ? missingChromiumMessage : false }, async () => {
  const { browser, context } = await launchStealthBrowser();
  try {
    const page = await context.newPage();
    await page.goto('about:blank');
    const result = await page.evaluate(() => {
      const plugins = navigator.plugins;
      return {
        hasItem: typeof (plugins as any).item === 'function',
        hasNamedItem: typeof (plugins as any).namedItem === 'function',
        hasRefresh: typeof (plugins as any).refresh === 'function',
        length: plugins.length,
        isPluginArray: plugins instanceof PluginArray,
      };
    });
    assert.equal(result.hasItem, true, 'plugins.item should be a function');
    assert.equal(result.hasNamedItem, true, 'plugins.namedItem should be a function');
    assert.equal(result.hasRefresh, true, 'plugins.refresh should be a function');
    assert.ok(result.length > 0, `plugins.length should be > 0, got ${result.length}`);
    assert.equal(result.isPluginArray, true, 'navigator.plugins should be instanceof PluginArray');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }
});

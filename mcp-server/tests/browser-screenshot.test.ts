import test from 'node:test';
import assert from 'node:assert/strict';

import { screenshot } from '../src/browser/actions/screenshot.js';
import { browserLauncher } from '../src/browser/launcher.js';

test('screenshot uses locator capture when selector is provided', async () => {
  let pageScreenshotCalls = 0;
  let locatorScreenshotCalls = 0;
  let usedSelector = '';

  const page = {
    screenshot: async () => {
      pageScreenshotCalls += 1;
      return Buffer.from('page-shot');
    },
    locator: (selector: string) => ({
      screenshot: async () => {
        usedSelector = selector;
        locatorScreenshotCalls += 1;
        return Buffer.from('locator-shot');
      },
    }),
    // applyPrivacyOverlay calls page.evaluate before capture; return a no-op
    // stats object so the redaction pass is a no-op in this locator test.
    evaluate: async () => ({ nodesRedacted: 0, elementsBlurred: 0 }),
  };

  const originalGetState = browserLauncher.getState.bind(browserLauncher);
  browserLauncher.getState = (() => ({
    activePageId: 1,
    pages: new Map([[1, page]]),
  })) as typeof browserLauncher.getState;

  try {
    const result = await screenshot({ fullPage: false, profile: 'default', selector: '#publish' });

    assert.equal(result.success, true);
    assert.equal(result.selector, '#publish');
    assert.equal(result.image, Buffer.from('locator-shot').toString('base64'));
    assert.equal(pageScreenshotCalls, 0);
    assert.equal(locatorScreenshotCalls, 1);
    assert.equal(usedSelector, '#publish');
  } finally {
    browserLauncher.getState = originalGetState;
  }
});

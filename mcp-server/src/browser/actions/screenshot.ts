import { promises as fs } from 'fs';
import * as path from 'path';

import { browserLauncher } from '../launcher.js';
import { applyPrivacyOverlay, type ApplyPrivacyOverlayOptions } from '../privacy-overlay.js';

export interface ScreenshotOptions {
  fullPage?: boolean;
  profile?: string;
  filePath?: string;
  selector?: string;
  /**
   * When true (default), apply a best-effort DOM PII redaction pass before
   * capturing. See src/browser/privacy-overlay.ts.
   */
  redactPii?: boolean;
  /**
   * Privacy preset name (e.g. 'gmail', 'wordpress-admin', 'generic').
   * Only used when redactPii is not false. Defaults to 'generic'.
   */
  privacyPreset?: string;
}

export async function screenshot(opts: ScreenshotOptions = {}) {
  const {
    fullPage = false,
    profile = 'default',
    filePath,
    selector,
    redactPii = true,
    privacyPreset,
  } = opts;

  const state = browserLauncher.getState(profile);
  if (!state || state.activePageId === null) {
    throw new Error('No active page');
  }

  const page = state.pages.get(state.activePageId);
  if (!page) {
    throw new Error('Page not found');
  }

  // Apply best-effort DOM PII redaction before capture. The overlay mutates
  // the live DOM transiently (a reload restores original content) so the
  // screenshot below captures a scrubbed view.
  let privacy;
  if (redactPii) {
    const overlayOpts: ApplyPrivacyOverlayOptions = { enabled: true };
    if (privacyPreset) overlayOpts.preset = privacyPreset;
    privacy = await applyPrivacyOverlay(page, overlayOpts);
  } else {
    privacy = { applied: false, preset: privacyPreset ?? 'generic', nodesRedacted: 0, elementsBlurred: 0, patternsApplied: [] as string[] };
  }

  const buffer = selector
    ? await page.locator(selector).screenshot()
    : await page.screenshot({ fullPage });

  let savedTo: string | undefined;
  if (filePath) {
    const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    savedTo = absolute;
  }

  return {
    success: true,
    image: buffer.toString('base64'),
    savedTo,
    fullPage,
    profile,
    selector,
    privacy,
  };
}

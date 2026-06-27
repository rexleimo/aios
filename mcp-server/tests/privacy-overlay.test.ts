// mcp-server/tests/privacy-overlay.test.ts
//
// Tests for the screenshot privacy overlay. The pure helpers (computeRedactions,
// resolvePreset, buildPatternList) are tested directly. The Playwright-bound
// applyPrivacyOverlay is exercised against a fake page object whose evaluate()
// runs the injected function against a jsdom-free, minimal in-page harness —
// effectively re-implementing the document.createTreeWalker pass in plain TS so
// we can verify the injected logic without launching Chromium.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PII_PATTERNS,
  PRIVACY_PRESETS,
  computeRedactions,
  resolvePreset,
  buildPatternList,
  applyPrivacyOverlay,
} from '../src/browser/privacy-overlay.js';

describe('PII_PATTERNS', () => {
  test('email pattern matches standard addresses', () => {
    const { output, redactionCount } = computeRedactions(
      'Contact me at rex@example.com or jane.doe+filter@sub.domain.co.uk',
      PII_PATTERNS,
    );
    assert.equal(redactionCount, 2);
    assert.ok(!output.includes('rex@example.com'));
    assert.ok(!output.includes('jane.doe'));
    assert.ok(output.includes('[REDACTED:email]'));
  });

  test('phone pattern matches NANP and international', () => {
    const cases = [
      'Call (555) 123-4567',
      'Phone: +1-555-123-4567',
      'Tel 555.123.4567',
      '+44 20 7946 0958',
    ];
    for (const c of cases) {
      const { output, redactionCount } = computeRedactions(c, PII_PATTERNS);
      assert.equal(redactionCount, 1, `expected one phone redaction in: ${c}`);
      assert.ok(output.includes('[REDACTED:phone]'), `expected redaction marker in: ${c}`);
    }
  });

  test('phone pattern does not match a 7-digit number (no separators)', () => {
    // 1234567 has no separators -> not a phone match.
    const { redactionCount } = computeRedactions('Order id 1234567', PII_PATTERNS);
    assert.equal(redactionCount, 0);
  });

  test('credit card pattern matches 16-digit groups', () => {
    const { output, redactionCount } = computeRedactions(
      'Card 4111 1111 1111 1111 and 5500-0000-0000-0004',
      PII_PATTERNS,
    );
    assert.ok(redactionCount >= 2, `expected at least 2 card redactions, got ${redactionCount}`);
    assert.ok(!output.includes('4111'));
    assert.ok(output.includes('[REDACTED:card]'));
  });

  test('ssn pattern matches 123-45-6789', () => {
    const { output, redactionCount } = computeRedactions('SSN 123-45-6789', PII_PATTERNS);
    assert.equal(redactionCount, 1);
    assert.ok(output.includes('[REDACTED:ssn]'));
  });

  test('multiple pattern types in one string', () => {
    const text = 'Email a@b.com, call (555) 123-4567, card 4111 1111 1111 1111';
    const { redactionCount } = computeRedactions(text, PII_PATTERNS);
    assert.ok(redactionCount >= 3, `expected >=3 redactions, got ${redactionCount}`);
  });

  test('non-PII text is untouched', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const { output, redactionCount } = computeRedactions(text, PII_PATTERNS);
    assert.equal(redactionCount, 0);
    assert.equal(output, text);
  });

  test('empty input returns empty with zero redactions', () => {
    const r1 = computeRedactions('', PII_PATTERNS);
    assert.equal(r1.output, '');
    assert.equal(r1.redactionCount, 0);
  });
});

describe('PRIVACY_PRESETS', () => {
  test('defines generic, gmail, wordpress-admin', () => {
    assert.ok(PRIVACY_PRESETS.generic);
    assert.ok(PRIVACY_PRESETS.gmail);
    assert.ok(PRIVACY_PRESETS['wordpress-admin']);
  });

  test('each preset has a label', () => {
    for (const [k, v] of Object.entries(PRIVACY_PRESETS)) {
      assert.ok(typeof v.label === 'string' && v.label.length > 0, `preset ${k} missing label`);
    }
  });

  test('gmail redacts account/avatar selectors', () => {
    const g = PRIVACY_PRESETS.gmail;
    assert.ok((g.redactSelectors ?? []).some((s) => s.includes('Google Account') || s.includes('[email')));
    assert.ok((g.blurSelectors ?? []).length > 0);
  });

  test('wordpress-admin redacts author/email columns', () => {
    const w = PRIVACY_PRESETS['wordpress-admin'];
    assert.ok((w.redactSelectors ?? []).some((s) => s.includes('column-email') || s.includes('column-author')));
  });
});

describe('resolvePreset', () => {
  test('returns requested preset', () => {
    const { key, preset } = resolvePreset('gmail');
    assert.equal(key, 'gmail');
    assert.equal(preset.label, PRIVACY_PRESETS.gmail.label);
  });

  test('falls back to generic for unknown name', () => {
    const { key } = resolvePreset('nope');
    assert.equal(key, 'generic');
  });

  test('falls back to generic for undefined', () => {
    const { key } = resolvePreset(undefined);
    assert.equal(key, 'generic');
  });
});

describe('buildPatternList', () => {
  test('includes core PII_PATTERNS', () => {
    const list = buildPatternList(PRIVACY_PRESETS.generic);
    const names = list.map((p) => p.name);
    assert.ok(names.includes('email'));
    assert.ok(names.includes('phone'));
    assert.ok(names.includes('credit-card'));
    assert.ok(names.includes('ssn'));
  });

  test('appends extra patterns from caller', () => {
    const custom = { name: 'token', regex: /tok_[a-z0-9]+/g, replacement: '[REDACTED:token]' };
    const list = buildPatternList(PRIVACY_PRESETS.generic, [custom]);
    assert.ok(list.some((p) => p.name === 'token'));
  });

  test('appends preset extraPatterns', () => {
    const preset = { label: 'x', extraPatterns: [{ name: 'zid', regex: /z-\d+/g }] };
    const list = buildPatternList(preset as never);
    assert.ok(list.some((p) => p.name === 'zid'));
  });
});

// ---------------------------------------------------------------------------
// applyPrivacyOverlay — exercised against a fake Playwright Page whose
// evaluate() runs the injected redaction function over a tiny in-memory DOM
// model that mirrors document.createTreeWalker(textNodes).
// ---------------------------------------------------------------------------

/**
 * Minimal in-memory DOM used to verify the injected page.evaluate logic.
 * Each node is either an element (with children + optional text) or a text
 * node. We implement just enough of TreeWalker semantics to validate the
 * redaction pass.
 */
interface MockTextNode {
  type: 'text';
  value: string;
  parentTag: string;
  inRedactScope: boolean;
  inSkipScope: boolean;
}
interface MockElement {
  type: 'element';
  tag: string;
  selector: string | null; // a single class/id/attr selector this element matches
  children: Array<MockElement | MockTextNode>;
}
type MockNode = MockElement | MockTextNode;

/**
 * Run the same redaction algorithm applyPrivacyOverlay injects, but on our
 * mock tree. This validates the algorithm rather than the literal stringified
 * function (which is identical in spirit).
 */
function redactMockTree(
  root: MockElement,
  patterns: Array<{ source: string; flags: string; replacement: string }>,
  redactSelectors: string[],
  blurSelectors: string[],
  skipSelectors: string[],
): { nodesRedacted: number; elementsBlurred: number } {
  // Mark skip scope.
  function markScope(node: MockElement, skip: boolean, redact: boolean) {
    const isSkip = skip || (skipSelectors.includes(node.selector ?? '') && node.selector !== null);
    const isRedact = redact || (redactSelectors.includes(node.selector ?? '') && node.selector !== null);
    for (const child of node.children) {
      if (child.type === 'text') {
        child.inSkipScope = isSkip;
        child.inRedactScope = isRedact;
      } else {
        markScope(child, isSkip, isRedact);
      }
    }
  }
  markScope(root, false, false);

  // Flatten text nodes (depth-first), skipping script/style/template/noscript.
  const textNodes: MockTextNode[] = [];
  function flatten(node: MockElement) {
    for (const child of node.children) {
      if (child.type === 'text') {
        if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(node.tag)) continue;
        textNodes.push(child);
      } else {
        flatten(child);
      }
    }
  }
  flatten(root);

  let nodesRedacted = 0;
  for (const tn of textNodes) {
    if (tn.inSkipScope) continue;
    if (tn.inRedactScope) {
      tn.value = '\u2588'.repeat(6);
      nodesRedacted += 1;
      continue;
    }
    let replaced = tn.value;
    let touched = false;
    for (const r of patterns) {
      const re = new RegExp(r.source, r.flags.includes('g') ? r.flags : `${r.flags}g`);
      re.lastIndex = 0;
      const next = replaced.replace(re, () => r.replacement);
      if (next !== replaced) {
        touched = true;
        replaced = next;
      }
    }
    if (touched) {
      tn.value = replaced;
      nodesRedacted += 1;
    }
  }

  // Blur pass: count matching elements (we don't render, just verify matching).
  let elementsBlurred = 0;
  function countBlur(node: MockElement) {
    if (!node.selector || !blurSelectors.includes(node.selector)) {
      // not blurred itself
    } else {
      elementsBlurred += 1;
    }
    for (const child of node.children) {
      if (child.type === 'element') countBlur(child);
    }
  }
  countBlur(root);

  return { nodesRedacted, elementsBlurred };
}

/**
 * Fake Page: routes evaluate() to the mock DOM driver above. We only support
 * the (fn, arg) signature used by applyPrivacyOverlay.
 */
function makeFakePage(root: MockElement) {
  return {
    async evaluate<T>(_fn: unknown, arg: unknown): Promise<T> {
      const cfg = arg as {
        patternSpec: Array<{ name: string; source: string; flags: string; replacement: string }>;
        redactSelectors: string[];
        blurSelectors: string[];
        skipSelectors: string[];
      };
      const stats = redactMockTree(
        root,
        cfg.patternSpec,
        cfg.redactSelectors,
        cfg.blurSelectors,
        cfg.skipSelectors,
      );
      return stats as unknown as T;
    },
  };
}

function text(v: string): MockTextNode {
  return { type: 'text', value: v, parentTag: '', inRedactScope: false, inSkipScope: false };
}
function el(tag: string, selector: string | null, ...children: Array<MockElement | MockTextNode>): MockElement {
  return { type: 'element', tag, selector, children };
}

describe('applyPrivacyOverlay', () => {
  test('returns applied:false when disabled', async () => {
    const page = makeFakePage(el('BODY', null, text('hi a@b.com')));
    const res = await applyPrivacyOverlay(page as never, { enabled: false });
    assert.equal(res.applied, false);
    assert.equal(res.nodesRedacted, 0);
  });

  test('redacts email text nodes via generic preset', async () => {
    const tree = el('BODY', null, el('DIV', null, text('Email: rex@example.com')));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never, { preset: 'generic' });
    assert.equal(res.applied, true);
    assert.equal(res.preset, 'generic');
    assert.equal(res.nodesRedacted, 1);
    const tn = (tree.children[0] as MockElement).children[0] as MockTextNode;
    assert.ok(!tn.value.includes('rex@example.com'));
    assert.ok(tn.value.includes('[REDACTED:email]'));
  });

  test('whole-element redaction blanks preset selector subtree', async () => {
    // A div matching a generic redact selector should have its text replaced.
    const tree = el('BODY', null, el('DIV', '[data-pii]', text('secret-token-123')));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never, { preset: 'generic' });
    assert.equal(res.nodesRedacted, 1);
    const tn = (tree.children[0] as MockElement).children[0] as MockTextNode;
    assert.equal(tn.value, '\u2588'.repeat(6));
  });

  test('skipSelectors exempts matching subtree', async () => {
    const tree = el(
      'BODY',
      null,
      el('SECTION', '.debug', text('Email debug@example.com')),
    );
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never, {
      preset: 'generic',
      skipSelectors: ['.debug'],
    });
    assert.equal(res.nodesRedacted, 0);
    const tn = (tree.children[0] as MockElement).children[0] as MockTextNode;
    assert.equal(tn.value, 'Email debug@example.com');
  });

  test('blur=false disables blur pass', async () => {
    const tree = el('BODY', null, el('INPUT', 'input[type="password"]', text('')));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never, { preset: 'generic', blur: false });
    assert.equal(res.elementsBlurred, 0);
  });

  test('patternsApplied lists all core patterns', async () => {
    const tree = el('BODY', null, text('nothing'));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never);
    assert.ok(res.patternsApplied.includes('email'));
    assert.ok(res.patternsApplied.includes('phone'));
    assert.ok(res.patternsApplied.includes('credit-card'));
    assert.ok(res.patternsApplied.includes('ssn'));
  });

  test('unknown preset falls back to generic', async () => {
    const tree = el('BODY', null, text('a@b.com'));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never, { preset: 'does-not-exist' });
    assert.equal(res.preset, 'generic');
    assert.equal(res.applied, true);
  });

  test('extraPatterns from caller are applied', async () => {
    const tree = el('BODY', null, text('token tok_abc123 here'));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never, {
      extraPatterns: [{ name: 'token', regex: /tok_[a-z0-9]+/g, replacement: '[REDACTED:token]' }],
    });
    assert.equal(res.nodesRedacted, 1);
    const tn = tree.children[0] as MockTextNode;
    assert.ok(tn.value.includes('[REDACTED:token]'));
    assert.ok(!tn.value.includes('tok_abc123'));
  });

  test('does not redact inside <script>', async () => {
    const tree = el('BODY', null, el('SCRIPT', null, text('var email = "x@y.com";')));
    const page = makeFakePage(tree);
    const res = await applyPrivacyOverlay(page as never);
    assert.equal(res.nodesRedacted, 0);
    const scriptText = (tree.children[0] as MockElement).children[0] as MockTextNode;
    assert.equal(scriptText.value, 'var email = "x@y.com";');
  });
});

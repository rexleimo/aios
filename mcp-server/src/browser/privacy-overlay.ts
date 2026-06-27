// mcp-server/src/browser/privacy-overlay.ts
//
// Screenshot privacy overlay — best-effort DOM-based PII redaction.
//
// IMPORTANT: This is NOT a security boundary. It is a "reduce accidental PII in
// screenshots" measure. The DOM manipulation happens in-page via
// page.evaluate() right before page.screenshot(), and only on a transient
// snapshot of the page — it does not persist across navigations or reloads.
//
// Strategy (DOM-injection approach, inspired by vision-test-harness, MIT):
//   1. Build a list of regex patterns to redact (email, phone, credit card,
//      plus preset-specific selectors' text content).
//   2. Walk every text node under <body> via document.createTreeWalker.
//   3. Replace each PII match inside a text node with [REDACTED], preserving
//      surrounding DOM structure (we only mutate node.nodeValue).
//   4. Optionally apply a CSS blur to sensitive selectors so even non-text
//      pixels (avatars, logos) are obscured in the captured screenshot.
//
// `computeRedactions` is exported as a pure function so it can be unit-tested
// without a browser. `applyPrivacyOverlay` is the Playwright entry point.

import type { Page } from 'playwright';

/** A single PII regex pattern + what to replace matches with. */
export interface PiiPattern {
  /** Stable identifier (email, phone, ...). */
  name: string;
  /** Regex tested against raw text. MUST be source-safe (no backrefs to <body>). */
  regex: RegExp;
  /** Replacement text. Defaults to '[REDACTED]'. */
  replacement?: string;
}

/**
 * Core PII regex patterns. Exported so presets, tests, and callers can reuse
 * and compose them. Intentionally conservative to minimize false positives
 * (e.g. phone requires separators so plain 7-digit numbers are not touched).
 *
 * ORDER MATTERS: more specific patterns (ssn, credit-card) run BEFORE the
 * broad phone pattern so that "123-45-6789" is redacted as an SSN and
 * "4111 1111 1111 1111" as a card, rather than being swallowed by the phone
 * regex. Callers iterating this list should preserve the order.
 */
export const PII_PATTERNS: ReadonlyArray<PiiPattern> = [
  {
    name: 'email',
    // Standard-ish email; caps length to avoid runaway matches.
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g,
    replacement: '[REDACTED:email]',
  },
  {
    name: 'ssn',
    // US Social Security Number: 123-45-6789 (must run before phone).
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED:ssn]',
  },
  {
    name: 'credit-card',
    // 13-19 digit groups, optionally separated by spaces/dashes, with loose Luhn-style grouping.
    // Runs before phone so 16-digit card numbers are not matched as phones.
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: '[REDACTED:card]',
  },
  {
    name: 'phone',
    // Matches NANP ( (555) 123-4567 ) and international ( +44 20 7946 0958 )
    // numbers. To avoid false positives on plain numeric ids, a match must
    // EITHER start with a + country code OR contain at least one separator
    // (space, dash, or dot). A bare unseparated 7-digit run is NOT matched.
    regex:
      /(?:\+\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){0,3}\d{4,6})|(?:(?:\(?\d{2,4}\)?[\s.-]){1,3}\d{4,6})/g,
    replacement: '[REDACTED:phone]',
  },
];

/** A named bundle of selectors + patterns for a known site layout. */
export interface PrivacyPreset {
  /** Human-readable label. */
  label: string;
  /** CSS selectors whose entire text subtree should be redacted (high signal). */
  redactSelectors?: string[];
  /** CSS selectors that should be CSS-blurred (avatars, logos, panels). */
  blurSelectors?: string[];
  /** Extra regex patterns to apply globally on top of PII_PATTERNS. */
  extraPatterns?: PiiPattern[];
}

/**
 * Built-in privacy presets. Selectors are deliberately broad and conservative
 * — when in doubt, redact. Callers can override/extend via options.
 */
export const PRIVACY_PRESETS: Readonly<Record<string, PrivacyPreset>> = {
  generic: {
    label: 'Generic PII redaction',
    redactSelectors: [
      'input[type="password"]',
      'input[name*="ssn" i]',
      'input[name*="credit" i]',
      'input[name*="card" i]',
      '[data-pii]',
      '[aria-label*="security code" i]',
    ],
    blurSelectors: ['input[type="password"]', '[data-pii-blur]'],
  },

  gmail: {
    label: 'Gmail / Google account UI',
    redactSelectors: [
      // Sender/recipient/subject lines and message previews
      '[email]',
      '.gd',
      '.gD',
      '.go',
      '[role="heading"]',
      // Account chip (shows full name + email)
      'a[aria-label*="Google Account" i]',
      // Compose recipient fields
      'input[people-kit-id]',
      '[email]',
    ],
    blurSelectors: [
      // Profile avatar image
      'img[aria-label*="Account" i]',
      'img.lllRwe', // common avatar class
    ],
    extraPatterns: [
      // Gmail message IDs / thread IDs in URLs are not PII but keep them out too.
    ],
  },

  'wordpress-admin': {
    label: 'WordPress admin (wp-admin)',
    redactSelectors: [
      // Author display name / email in user list rows
      'td.column-author',
      'td.column-email',
      'td.column-username',
      '#wp-admin-bar-my-account',
      '.wp-profile-row',
    ],
    blurSelectors: [
      // Avatar images
      'img.avatar',
    ],
  },
};

/** Options for {@link applyPrivacyOverlay}. */
export interface ApplyPrivacyOverlayOptions {
  /** Preset name from PRIVACY_PRESETS; defaults to 'generic'. */
  preset?: string;
  /** When false, the overlay is skipped entirely. Default true. */
  enabled?: boolean;
  /** Additional patterns to apply on top of preset + core patterns. */
  extraPatterns?: PiiPattern[];
  /** Additional CSS selectors to redact (merged with preset). */
  redactSelectors?: string[];
  /** Additional CSS selectors to blur (merged with preset). Default true. */
  blurSelectors?: string[];
  /** Set false to skip the CSS blur pass (still redacts text). Default true. */
  blur?: boolean;
  /**
   * Skip redaction for elements matching these CSS selectors (e.g. a debug
   * panel you want to keep readable).
   */
  skipSelectors?: string[];
}

/** Result reported back from {@link applyPrivacyOverlay}. */
export interface PrivacyOverlayResult {
  applied: boolean;
  preset: string;
  nodesRedacted: number;
  elementsBlurred: number;
  patternsApplied: string[];
}

/**
 * Pure function: given an input string and a list of patterns, return the
 * redacted string plus a count of substitutions made. Exported for unit
 * testing without a browser.
 */
export function computeRedactions(
  input: string,
  patterns: ReadonlyArray<PiiPattern>,
): { output: string; redactionCount: number } {
  if (!input) return { output: input, redactionCount: 0 };
  let output = input;
  let redactionCount = 0;
  for (const p of patterns) {
    // Each pattern is its own regex instance; reset lastIndex defensively.
    const re = new RegExp(p.regex.source, p.regex.flags.includes('g') ? p.regex.flags : `${p.regex.flags}g`);
    output = output.replace(re, () => {
      redactionCount += 1;
      return p.replacement ?? '[REDACTED]';
    });
  }
  return { output, redactionCount };
}

/** Resolve the effective preset object for a name (falls back to generic). */
export function resolvePreset(name?: string): { key: string; preset: PrivacyPreset } {
  const key = (name && PRIVACY_PRESETS[name] ? name : 'generic') as keyof typeof PRIVACY_PRESETS;
  return { key, preset: PRIVACY_PRESETS[key] };
}

/** Merge core patterns with a preset's extras + caller extras. */
export function buildPatternList(
  preset: PrivacyPreset,
  extra?: PiiPattern[],
): PiiPattern[] {
  return [...PII_PATTERNS, ...(preset.extraPatterns ?? []), ...(extra ?? [])];
}

/**
 * Apply the privacy overlay to a Playwright page, in-page.
 *
 * This mutates the live DOM (text node values + inline styles) so the next
 * `page.screenshot()` captures a redacted view. The mutation is transient —
 * a reload restores original content.
 */
export async function applyPrivacyOverlay(
  page: Page,
  options: ApplyPrivacyOverlayOptions = {},
): Promise<PrivacyOverlayResult> {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      applied: false,
      preset: options.preset ?? 'generic',
      nodesRedacted: 0,
      elementsBlurred: 0,
      patternsApplied: [],
    };
  }

  const { key, preset } = resolvePreset(options.preset);
  const patterns = buildPatternList(preset, options.extraPatterns);
  const redactSelectors = unique([...(preset.redactSelectors ?? []), ...(options.redactSelectors ?? [])]);
  const blurSelectors = options.blur === false ? [] : unique([...(preset.blurSelectors ?? []), ...(options.blurSelectors ?? [])]);
  const skipSelectors = options.skipSelectors ?? [];

  // Serialize patterns for in-page use: {name, source, flags, replacement}.
  const patternSpec = patterns.map((p) => ({
    name: p.name,
    source: p.regex.source,
    flags: p.regex.flags.includes('g') ? p.regex.flags : `${p.regex.flags}g`,
    replacement: p.replacement ?? '[REDACTED]',
  }));

  const stats = await page.evaluate(
    async (cfg) => {
      const { patternSpec, redactSelectors, blurSelectors, skipSelectors } = cfg as {
        patternSpec: Array<{ name: string; source: string; flags: string; replacement: string }>;
        redactSelectors: string[];
        blurSelectors: string[];
        skipSelectors: string[];
      };

      // Compile regexes once.
      const regexes = patternSpec.map((p) => ({
        ...p,
        re: new RegExp(p.source, p.flags) as RegExp,
      }));

      // Build the skip set: any element matching skipSelectors (or its descendants).
      const skipEls = new Set<Element>();
      for (const sel of skipSelectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            skipEls.add(el);
            el.querySelectorAll('*').forEach((d) => skipEls.add(d));
          });
        } catch {
          /* invalid selector — ignore */
        }
      }

      const isInSkip = (node: Node | null): boolean => {
        let cur: Node | null = node;
        while (cur && cur !== document.body) {
          if (cur.nodeType === 1 && skipEls.has(cur as Element)) return true;
          cur = cur.parentNode;
        }
        return false;
      };

      // --- 1. Element-scoped redaction: clear text of preset.redactSelectors ---
      const wholeElementBlank = '\u2588'.repeat(6); // ████ — visual placeholder
      for (const sel of redactSelectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            if (skipEls.has(el)) return;
            // Replace visible text in this subtree but keep structure.
            const sub = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
              acceptNode: (n) =>
                n.nodeValue && n.nodeValue.trim()
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT,
            });
            let cur2: Node | null;
            while ((cur2 = sub.nextNode())) {
              if (isInSkip(cur2)) continue;
              (cur2 as Text).nodeValue = wholeElementBlank;
            }
          });
        } catch {
          /* invalid selector */
        }
      }

      // --- 2. Global text-node regex redaction over <body> ---
      let nodesRedacted = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (isInSkip(n)) return NodeFilter.FILTER_REJECT;
          // Skip script/style/template contents.
          const parent = n.parentElement;
          if (parent) {
            const tag = parent.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue ?? '';
        let replaced = text;
        let touched = false;
        for (const r of regexes) {
          r.re.lastIndex = 0;
          const next = replaced.replace(r.re, () => r.replacement);
          if (next !== replaced) {
            touched = true;
            replaced = next;
          }
        }
        if (touched) {
          (node as Text).nodeValue = replaced;
          nodesRedacted += 1;
        }
      }

      // --- 3. CSS blur pass ---
      let elementsBlurred = 0;
      for (const sel of blurSelectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            if (skipEls.has(el)) return;
            const html = el as HTMLElement;
            const existing = html.getAttribute('style') ?? '';
            // Use a high blur + slight darken so the region reads as "obscured".
            html.setAttribute(
              'style',
              `${existing}; filter: blur(8px) brightness(0.85) !important;`.trimStart(),
            );
            elementsBlurred += 1;
          });
        } catch {
          /* invalid selector */
        }
      }

      return { nodesRedacted, elementsBlurred };
    },
    { patternSpec, redactSelectors, blurSelectors, skipSelectors },
  );

  return {
    applied: true,
    preset: key,
    nodesRedacted: stats.nodesRedacted,
    elementsBlurred: stats.elementsBlurred,
    patternsApplied: patterns.map((p) => p.name),
  };
}

/** Deduplicate a string array, preserving order. */
function unique(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

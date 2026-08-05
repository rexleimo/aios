// mcp-server/src/browser/index.ts
import { profileManager } from './profiles.js';
import { browserLauncher } from './launcher.js';
import { navigate } from './actions/navigate.js';
import { click } from './actions/click.js';
import { type } from './actions/type.js';
import { setInputFiles } from './actions/set-input-files.js';
import { snapshot } from './actions/snapshot.js';
import { screenshot } from './actions/screenshot.js';
import { authCheck, normalizeRlAuthState } from './actions/auth-check.js';
import { challengeCheck, normalizeRlChallengeState } from './actions/challenge-check.js';
import { compactRlSnapshot } from './actions/snapshot.js';
import { getBrowserHealth } from './health.js';

export {
  profileManager,
  browserLauncher,
  navigate,
  click,
  type,
  setInputFiles,
  snapshot,
  screenshot,
  authCheck,
  challengeCheck,
  compactRlSnapshot,
  normalizeRlAuthState,
  normalizeRlChallengeState,
  getBrowserHealth,
};

// MCP tool definitions
export const tools = [
  {
    name: 'browser_health',
    description: 'Report MCP, profile, CDP, and active browser health without launching a browser.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_launch',
    description: 'Launch browser. Defaults to a visible (headful) browser window unless headless mode is explicitly requested.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string', default: 'default' },
        url: { type: 'string' },
        headless: { type: 'boolean' },
        visible: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate to URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        profile: { type: 'string', default: 'default' },
        newTab: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'browser_click',
    description: 'Click element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        profile: { type: 'string', default: 'default' },
        double: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        profile: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'browser_set_input_files',
    description: 'Set files on a file input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string' },
        },
        profile: { type: 'string', default: 'default' },
      },
      required: ['selector', 'files'],
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Get page snapshot',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string', default: 'default' },
        mode: { type: 'string', enum: ['hybrid', 'ax'], default: 'hybrid' },
        includeAx: { type: 'boolean', default: false },
        axMaxLines: { type: 'number', default: 350 },
        axVerbose: { type: 'boolean', default: false },
        includeHtml: { type: 'boolean', default: false },
        htmlMaxChars: { type: 'number', default: 1500 },
      },
    },
  },
  {
    name: 'browser_auth_check',
    description: 'Check whether current page likely requires manual login',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'browser_challenge_check',
    description: 'Check whether current page is blocked by anti-bot challenge (Cloudflare/Google/captcha)',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take screenshot. By default applies a best-effort DOM PII redaction overlay (emails, phones, credit cards, sensitive selectors) before capture; set redactPii=false to skip.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', default: false },
        profile: { type: 'string', default: 'default' },
        filePath: { type: 'string' },
        selector: { type: 'string' },
        redactPii: { type: 'boolean', default: true },
        privacyPreset: {
          type: 'string',
          enum: ['generic', 'gmail', 'wordpress-admin'],
          default: 'generic',
        },
      },
    },
  },
];

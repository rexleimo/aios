// Replace the 5 identical brand marks in the capability strip with distinct
// minimal line icons. currentColor makes them adapt to light/dark automatically.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(ROOT, 'landing/index.html');
let html = fs.readFileSync(file, 'utf8');

const ICONS = {
  local: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="19" width="30" height="21" rx="4"></rect><path d="M15 19v-5a9 9 0 0 1 18 0v5"></path><circle cx="24" cy="29" r="2.4"></circle></svg>',
  memory: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 9a5 5 0 0 0-5 5v4a5 5 0 0 0 0 10v4a5 5 0 0 0 5 5"></path><path d="M28 9a5 5 0 0 1 5 5v4a5 5 0 0 1 0 10v4a5 5 0 0 1-5 5"></path><path d="M24 9v30"></path></svg>',
  route: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><circle cx="36" cy="24" r="4"></circle><circle cx="12" cy="36" r="4"></circle><path d="M16 12h9a5 5 0 0 1 5 5v3M16 36h9a5 5 0 0 0 5-5v-3"></path></svg>',
  team: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="13" r="5"></circle><circle cx="11" cy="33" r="5"></circle><circle cx="37" cy="33" r="5"></circle><path d="M24 18v7M24 25 13 30M24 25l11 5"></path></svg>',
  verify: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6 38 11v11c0 9-6 15-14 19-8-4-14-10-14-19V11L24 6Z"></path><path d="m18 24 4 4 8-9"></path></svg>',
};

const marks = [...html.matchAll(/<img class="bird" src="assets\/media\/aios\/mark\.png" width="124" height="124" alt="">/g)];
if (marks.length !== 5) throw new Error('expected 5 capability marks, found ' + marks.length);
const keys = ['local', 'memory', 'route', 'team', 'verify'];
let i = 0;
html = html.replace(/<img class="bird" src="assets\/media\/aios\/mark\.png" width="124" height="124" alt="">/g,
  () => `<span class="cap-glyph">${ICONS[keys[i++]]}</span>`);

// Style for the new glyph (kept local to this page via scoped CSS in <head>).
const style = `<style>
.cap-glyph { flex: none; display: grid; place-items: center; width: 124px; height: 96px; color: var(--ink); }
.cap-glyph svg { width: 62px; height: 62px; }
@media (max-width: 560px) { .cap-glyph { width: 88px; height: 60px; } .cap-glyph svg { width: 48px; height: 48px; } }
</style>\n`;
html = html.replace('</head>', style + '</head>');
fs.writeFileSync(file, html);
console.log('replaced', i, 'capability marks with distinct icons');

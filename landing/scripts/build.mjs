// Build landing/index.html from the captured reference source.
// - swaps the inline <style> for a local stylesheet
// - strips analytics / third-party trackers (no side effects in the clone)
// - rewrites root-relative image/icon URLs to local downloaded assets
// - keeps the page's own theme, navigation and routing-demo scripts intact
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let html = fs.readFileSync(path.join(ROOT, 'docs/research/reference-full.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'landing/assets/css/reference-0.css'), 'utf8');

// 1. Externalise CSS (exact bytes from the source).
const styleRe = /<style>([\s\S]*?)<\/style>/;
if (!styleRe.test(html)) throw new Error('inline style not found');
html = html.replace(styleRe, '<link rel="stylesheet" href="assets/css/style.css">');
fs.writeFileSync(path.join(ROOT, 'landing/assets/css/style.css'), css);

// 2. Strip analytics / trackers. Keep the theme, nav and routing scripts.
const before = html.length;
html = html.replace(/<script[^>]*src="https:\/\/usemagpie\.ai\/r\/static\/[^"]*"[^>]*>\s*<\/script>\s*/g, '');
html = html.replace(/<script[^>]*src="https:\/\/static\.cloudflareinsights\.com[^"]*"[^>]*>\s*<\/script>\s*/g, '');
html = html.replace(/<script>\s*try\{if\(\/Linux\/[\s\S]*?<\/script>\s*/g, '');
html = html.replace(/<script>\s*if\(!\(navigator\.doNotTrack[\s\S]*?<\/script>\s*/g, '');
console.log('analytics stripped bytes:', before - html.length);

// 3. Localise assets. Only /img, /icons and /favicon are assets; /download, /docs,
//    /zh etc. stay as links (no visual effect, and meaningful on the live domain).
const assetBefore = (html.match(/"\/img\/|"\/icons\/|"\/favicon\.png/g) || []).length;
html = html.replace(/(["'(])\/img\//g, '$1assets/media/img/');
html = html.replace(/(["'(])\/icons\//g, '$1assets/media/icons/');
html = html.replace(/"\/favicon\.png/g, '"assets/media/favicon.png');
console.log('asset refs localised:', assetBefore);

// 4. Keep a small provenance comment (not rendered).
html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Pixel clone of https://usemagpie.ai/zh/ — assets localised, analytics removed. -->');

fs.writeFileSync(path.join(ROOT, 'landing/index.html'), html);
console.log('wrote landing/index.html bytes=', html.length);

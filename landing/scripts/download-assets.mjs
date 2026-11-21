// Download every image referenced by the reference page into landing/assets/img,
// preserving the remote directory layout so URLs map 1:1 to local paths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/research/extract-desktop.json'), 'utf8'));
const IMG_ROOT = path.join(ROOT, 'landing/assets/img');

const urls = new Set();
for (const i of data.images) if (i.src && i.src.startsWith('http')) urls.add(i.src);

const jobs = [...urls];
let done = 0, failed = 0;
async function worker(queue) {
  while (queue.length) {
    const url = queue.shift();
    const u = new URL(url);
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '');
    const dest = path.join(IMG_ROOT, rel);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { done++; continue; }
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      done++;
    } catch (e) {
      failed++;
      console.error('FAIL', url, e.message);
    }
  }
}
await Promise.all([worker(jobs), worker(jobs), worker(jobs), worker(jobs)]);
console.log(`downloaded=${done} failed=${failed} total=${urls.size}`);

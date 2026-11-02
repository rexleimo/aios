// Collects the facts a design contract has to state, and refuses to state the
// ones it cannot see.
//
// Every value here is measured from the project: which files are UI surfaces,
// which directories hold generated output, which durations and easings already
// appear, whether a reduced-motion block exists. None of it is guessed, and
// nothing writes prose. The model's job is the decisions this file leaves
// blank; the generator's job is to make those blanks specific instead of vague.
//
// A fact that cannot be established is reported as unknown, never defaulted. A
// contract claiming "we cover src/" when src/ does not exist is worse than one
// saying it has not been scoped yet.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WEB_EXTENSIONS = Object.freeze(['.css', '.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);

const UI_FRAMEWORKS = Object.freeze({
  react: ['react'],
  vue: ['vue'],
  svelte: ['svelte'],
  astro: ['astro'],
  solid: ['solid-js'],
  preact: ['preact'],
});

function runGit(args, cwd) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

export function isGitWorkTree(rootDir) {
  const result = runGit(['rev-parse', '--is-inside-work-tree'], rootDir);
  return result.ok && result.stdout.trim() === 'true';
}

export function listTrackedFiles(rootDir) {
  const result = runGit(['ls-files', '-z'], rootDir);
  if (!result.ok) return null;
  return result.stdout.split('\0').map((line) => line.trim()).filter(Boolean);
}

/**
 * An untracked file is invisible to `git ls-files`, so a project that wrote its
 * UI before running `git add` measures as zero surfaces. Reporting "0 surfaces"
 * as a fact would let a contract claim a scope it never looked at - and this
 * repository has already been bitten by the same blindness once, when
 * `aios standards check` could not see new files.
 */
function countUntracked(rootDir) {
  const result = runGit(['ls-files', '--others', '--exclude-standard', '-z'], rootDir);
  if (!result.ok) return null;
  return result.stdout.split('\0').filter(Boolean).length;
}

function describeUnknowns({ files, trackedCount, surfaces }) {
  const unknown = [];
  if (files === null) unknown.push('tracked file list (not a git work tree)');
  else if (trackedCount === 0) unknown.push('no tracked files, so nothing could be measured');
  else if (surfaces === 0) unknown.push('no UI source files among the tracked files (check extensions and exclusions)');
  return unknown;
}

/**
 * Generated output and dependencies are not UI surfaces: scanning them turns
 * history into technical debt. The list is a set of *shapes* rather than this
 * repository's directory names, so it travels.
 *
 * A project can override it in its instance file; the generator reports what it
 * excluded so an override is a decision, not a guess.
 */
export const GENERATED_SHAPES = Object.freeze([
  { pattern: /^(node_modules|vendor-modules)\//, why: 'dependencies' },
  { pattern: /^(dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit)\//, why: 'build output' },
  { pattern: /^(site|blog-site|docs-built|public\/built)\//, why: 'generated site' },
  { pattern: /^temp\//, why: 'scratch directory' },
]);

export function classifySurfaces(files) {
  const surfaces = [];
  const excluded = new Map();
  for (const file of files) {
    const lower = file.toLowerCase();
    if (!WEB_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
    const shape = GENERATED_SHAPES.find((entry) => entry.pattern.test(file));
    if (shape) {
      const bucket = excluded.get(shape.why) ?? [];
      bucket.push(file);
      excluded.set(shape.why, bucket);
      continue;
    }
    surfaces.push(file);
  }
  return { surfaces, excluded: [...excluded.entries()].map(([why, list]) => ({ why, count: list.length })) };
}

export function detectFrameworks(rootDir) {
  const manifests = ['package.json', 'mcp-server/package.json', 'website/package.json'];
  const deps = new Set();
  for (const relative of manifests) {
    const file = path.join(rootDir, relative);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of Object.keys({ ...parsed.dependencies, ...parsed.devDependencies })) deps.add(key);
    } catch {
      // A malformed manifest is not a design decision; the caller sees no
      // framework rather than a crash.
    }
  }
  const found = [];
  for (const [name, markers] of Object.entries(UI_FRAMEWORKS)) {
    if (markers.some((marker) => deps.has(marker))) found.push(name);
  }
  return { frameworks: found, hasReact: deps.has('react') };
}

// Accepts `.18s` as well as `180ms` and `1.2s`: a leading digit is not required,
// and requiring it silently dropped the most common way a duration is written
// with a unit elided.
const DURATION = /(?:transition|animation)(?:-duration)?\s*:[^;}]*?(\d*\.?\d+)(ms|s)[^a-z]/gi;
const EASING = /cubic-bezier\(([^)]+)\)/gi;
const REDUCED = /@media[^{]*prefers-reduced-motion[^{]*\{/i;
const HAS_MOTION = /(animation|transition)\s*:/;

export function measureMotion(surfaceFiles, rootDir, readFile = (file) => fs.readFileSync(file, 'utf8')) {
  const durations = new Map();
  const easings = new Map();
  const withoutReducedMotion = [];
  let scanned = 0;

  for (const relative of surfaceFiles) {
    let text;
    try {
      text = readFile(path.join(rootDir, relative));
    } catch {
      continue;
    }
    scanned++;
    if (HAS_MOTION.test(text) && !REDUCED.test(text)) withoutReducedMotion.push(relative);
    for (const match of text.matchAll(DURATION)) {
      const ms = match[2].toLowerCase() === 's' ? Number(match[1]) * 1000 : Number(match[1]);
      if (!Number.isFinite(ms)) continue;
      durations.set(ms, (durations.get(ms) ?? 0) + 1);
    }
    for (const match of text.matchAll(EASING)) {
      const curve = `cubic-bezier(${match[1].replace(/\s+/g, '')})`;
      easings.set(curve, (easings.get(curve) ?? 0) + 1);
    }
  }

  const byCount = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
  return {
    scanned,
    durations: byCount(durations).slice(0, 8).map(([ms, count]) => ({ ms, count })),
    easings: byCount(easings).slice(0, 8).map(([curve, count]) => ({ curve, count })),
    withoutReducedMotion,
    hasReducedMotionBlock: scanned > 0 && withoutReducedMotion.length < scanned,
  };
}

/**
 * A project layout: entry points an agent would edit, grouped so the instance
 * can name them without a human hunting through a file tree.
 */
export function describeLayout(surfaceFiles) {
  const groups = new Map();
  for (const file of surfaceFiles) {
    const top = file.includes('/') ? file.split('/')[0] : '(root)';
    const bucket = groups.get(top) ?? { top, files: [], count: 0 };
    bucket.count++;
    if (bucket.files.length < 6) bucket.files.push(file);
    groups.set(top, bucket);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** @returns facts only. No prose, no decisions, no file written. */
export function collectFacts({ rootDir = process.cwd(), readFile } = {}) {
  const files = listTrackedFiles(rootDir);
  const gitWorkTree = isGitWorkTree(rootDir);
  const tracked = files ?? [];
  const { surfaces, excluded } = classifySurfaces(tracked);
  return {
    rootDir,
    gitWorkTree,
    trackedCount: tracked.length,
    surfaces,
    excluded,
    layout: describeLayout(surfaces),
    framework: detectFrameworks(rootDir),
    motion: measureMotion(surfaces, rootDir, readFile),
    // Stated so the instance can say it, and so a caller can refuse to pretend.
    unknown: describeUnknowns({ files, trackedCount: tracked.length, surfaces: surfaces.length }),
    untracked: countUntracked(rootDir),
  };
}

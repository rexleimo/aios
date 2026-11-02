// Collects the facts a design contract has to state, and refuses to state the
// ones it cannot see.
//
// Every value here is measured from the project: which files are UI surfaces,
// which framework is present, which durations and easings already appear,
// whether a reduced-motion block exists, which tokens and themes are declared.
// None of it is guessed, and nothing writes prose. The model's job is the
// decisions this file leaves blank; the generator's job is to make those blanks
// specific instead of vague.
//
// A fact that cannot be established is reported as unknown, never defaulted. A
// contract claiming "we cover src/" when src/ does not exist is worse than one
// saying it has not been scoped yet.
//
// Surface discovery itself lives in surfaces.mjs: it has a second consumer (the
// declaration gate), and two lists of exclusions that disagree would put
// different trees into a contract's scope depending on who was asked.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { classifySurfaces } from './surfaces.mjs';
import { measureVisual } from './visual.mjs';

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
// with the unit elided.
const DURATION = /(?:transition|animation)(?:-duration)?\s*:[^;}]*?(\d*\.?\d+)(ms|s)[^a-z]/gi;
const EASING = /cubic-bezier\(([^)]+)\)/gi;
const REDUCED = /@media[^{]*prefers-reduced-motion[^{]*\{/i;
const HAS_MOTION = /(animation|transition)\s*:/;

// `readFile` takes a project-relative path, matching measureVisual: two
// measurers with two path conventions is how one of them silently reads nothing.
export function measureMotion(surfaceFiles, rootDir, readFile = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')) {
  const durations = new Map();
  const easings = new Map();
  const withoutReducedMotion = [];
  let scanned = 0;

  for (const relative of surfaceFiles) {
    let text;
    try {
      text = readFile(relative);
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
  const classified = classifySurfaces(tracked, { rootDir });
  const { surfaces, excluded } = classified;
  // One reader, taking a project-relative path. Both measurers call it that way,
  // and a second join here would silently read the wrong file: `path.join` with
  // an absolute second argument produces /root/root/file, not /root/file.
  const read = readFile ?? ((relative) => fs.readFileSync(path.join(rootDir, relative), 'utf8'));

  const unknown = describeUnknowns({ files, trackedCount: tracked.length, surfaces: surfaces.length });
  // A malformed project exclusion file is an unknown, not a default: falling
  // back to "no project exclusions" would quietly put every excluded tree back
  // into scope.
  if (classified.error) unknown.push(classified.error);

  return {
    rootDir,
    gitWorkTree,
    trackedCount: tracked.length,
    surfaces,
    excluded,
    projectExclusions: classified.projectExclusions,
    layout: describeLayout(surfaces),
    framework: detectFrameworks(rootDir),
    motion: measureMotion(surfaces, rootDir, read),
    visual: measureVisual(surfaces, read),
    unknown,
    untracked: countUntracked(rootDir),
  };
}

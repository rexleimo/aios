// The single owner of "what counts as a UI surface in this project".
//
// Two lists existed and disagreed: the declaration gate excluded
// `docs/reports/`, `docs-site/overrides/` and `docs-site/assets/vendor/`, while
// the design facts scanner did not, so a one-off report and a Remotion frame
// landed in a contract's scope. A project that is asked two different questions
// about its own surface list will get two different answers, and both will look
// authoritative.
//
// Two layers, because they answer different questions:
//
//   SHAPES   - what is never a UI surface, in any project. Build output,
//              dependencies, scratch directories. True everywhere, so it is code.
//   PROJECT  - what this particular project excludes, and why. `video/` renders
//              per frame and has its own evidence; that is a project decision,
//              not a universal truth, so it lives in config and carries a reason.
//
// An exclusion without a reason is a silent skip, which this repository treats as
// worse than a violation: it hides a decision instead of recording one.

import fs from 'node:fs';
import path from 'node:path';

export const WEB_EXTENSIONS = Object.freeze(['.css', '.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);

/** Universal: never a UI surface, in any project. */
export const SHAPES = Object.freeze([
  { test: /^(node_modules|vendor-modules)\//, why: 'dependencies' },
  { test: /^(dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit)\//, why: 'build output' },
  { test: /^(site|blog-site|docs-built|public\/built)\//, why: 'generated site' },
  { test: /^temp\//, why: 'scratch directory' },
  // Reports and vendored third-party assets are artifacts of work, not surfaces
  // to design. Anchored loosely because they can sit at any depth.
  { test: /(^|\/)reports\//, why: 'one-off report artifact' },
  { test: /(^|\/)overrides\//, why: 'generated template partial' },
  { test: /(^|\/)assets\/vendor\//, why: 'vendored third-party asset' },
]);

export const PROJECT_EXCLUSIONS_PATH = path.join('config', 'design-contract', 'exclusions.json');

/**
 * @returns {{exclusions: Array<{prefix: string, why: string}>, error: string|null}}
 * A malformed project file is reported, not ignored: silently falling back to
 * "no project exclusions" would put every excluded tree back into scope.
 */
export function readProjectExclusions(rootDir) {
  const file = path.join(rootDir, PROJECT_EXCLUSIONS_PATH);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exclusions: [], error: null };
    return { exclusions: [], error: `${PROJECT_EXCLUSIONS_PATH}: ${error.message}` };
  }
  try {
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed.exclusions) ? parsed.exclusions : [];
    const exclusions = entries
      .filter((entry) => typeof entry?.prefix === 'string' && entry.prefix.trim())
      .map((entry) => ({ prefix: entry.prefix.trim(), why: typeof entry.why === 'string' && entry.why.trim() ? entry.why.trim() : '' }));
    const unreasoned = exclusions.filter((entry) => !entry.why).map((entry) => entry.prefix);
    // An entry without a reason is reported and NOT applied: honouring it would
    // hide a decision instead of recording one, and the files it hides would
    // vanish from scope with nothing left to say why.
    const reasoned = exclusions.filter((entry) => entry.why);
    if (unreasoned.length) {
      return { exclusions: reasoned, error: `${PROJECT_EXCLUSIONS_PATH}: exclusion without a reason: ${unreasoned.join(', ')}` };
    }
    return { exclusions: reasoned, error: null };
  } catch (error) {
    return { exclusions: [], error: `${PROJECT_EXCLUSIONS_PATH}: ${error.message}` };
  }
}

/**
 * @returns {{
 *   surfaces: string[],
 *   excluded: Array<{why: string, count: number}>,
 *   projectExclusions: Array<{prefix: string, why: string}>,
 *   error: string|null,
 * }}
 */
export function classifySurfaces(files, { rootDir = process.cwd(), projectExclusions } = {}) {
  const loaded = projectExclusions ?? readProjectExclusions(rootDir);
  const surfaces = [];
  const excluded = new Map();

  const note = (why) => {
    excluded.set(why, (excluded.get(why) ?? 0) + 1);
  };

  for (const file of files) {
    const lower = file.toLowerCase();
    if (!WEB_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;

    const project = loaded.exclusions.find((entry) => file === entry.prefix || file.startsWith(entry.prefix.endsWith('/') ? entry.prefix : `${entry.prefix}/`));
    if (project) {
      note(project.why || `excluded by ${PROJECT_EXCLUSIONS_PATH}`);
      continue;
    }

    const shape = SHAPES.find((entry) => entry.test.test(file));
    if (shape) {
      note(shape.why);
      continue;
    }

    surfaces.push(file);
  }

  return {
    surfaces,
    excluded: [...excluded.entries()].map(([why, count]) => ({ why, count })).sort((a, b) => b.count - a.count),
    projectExclusions: loaded.exclusions,
    error: loaded.error,
  };
}

/** Whether a single path is a surface, using the same rules. */
export function isSurface(file, options = {}) {
  return classifySurfaces([file], options).surfaces.length === 1;
}

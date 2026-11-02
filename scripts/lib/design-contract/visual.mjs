// Measures a project's visual language: the tokens it declares, the themes it
// ships, the fonts it stacks, and how much colour bypasses the tokens.
//
// This is the evidence a DESIGN.md is supposed to cite. Written as measurement
// rather than extraction on purpose: the generator's job is to put what exists
// in front of a person, not to decide what a palette should be. A tool that
// picked colours would be authoring a brand nobody signed off on.
//
// The drift number (literals outside token files) is the one that changes
// behaviour: a project with 194 tokens and 42 hardcoded colours in one page does
// not have a design system, it has a design system next to some CSS.

// Matched anywhere, not only at line start: writing several declarations on one
// line is legal CSS and common in hand-written fixtures, and a line-anchored
// pattern silently reports a project as having no tokens. The final semicolon is
// optional because a declaration immediately before `}` does not need one, and
// requiring it drops the last token of every block.
const CUSTOM_PROPERTY = /(--[a-z0-9-]+)\s*:\s*([^;{}]+)\s*(?:;|(?=\s*}))/gi;
const FONT_STACK = /font-family\s*:\s*([^;}]+)/gi;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const THEME_SELECTOR = /^(:root[^{]*)\{/;


/**
 * A token family is the first segment of the property name after the namespace:
 * `--rex-space-4` belongs to `space`, `--rex-font-body` to `font`. Grouping by
 * role is what makes the measurement readable; grouping by file is not, because
 * one file usually holds every role.
 */
export function groupTokens(tokens) {
  const groups = new Map();
  for (const token of tokens) {
    const role = token.name.replace(/^--[a-z0-9]+-/, '').split('-')[0];
    const bucket = groups.get(role) ?? { role, count: 0, examples: [] };
    bucket.count++;
    if (bucket.examples.length < 3) bucket.examples.push(`${token.name}: ${token.value}`);
    groups.set(role, bucket);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Files that declare enough custom properties to be a token source. */
export function findTokenFiles(surfaceFiles, readFile) {
  const found = [];
  for (const relative of surfaceFiles) {
    if (!/\.css$/i.test(relative)) continue;
    let text;
    try {
      text = readFile(relative);
    } catch {
      continue;
    }
    const tokens = [];
    for (const match of text.matchAll(CUSTOM_PROPERTY)) {
      const name = match[1].trim();
      // `var(--x)` references are not declarations; the `:` requirement above
      // already excludes them, and this guards the same name declared twice.
      if (tokens.some((token) => token.name === name)) continue;
      tokens.push({ name, value: match[2].trim() });
    }
    // A handful of properties is an ordinary stylesheet; dozens is a system.
    if (tokens.length >= 5) found.push({ path: relative, tokens, themes: themesIn(text), fonts: fontsIn(text) });
  }
  return found;
}

export function themesIn(text) {
  const themes = [];
  for (const line of text.split(/\r?\n/)) {
    const match = THEME_SELECTOR.exec(line.trim());
    if (match) themes.push(match[1].trim());
  }
  return themes;
}

export function fontsIn(text) {
  const found = [];
  for (const match of text.matchAll(FONT_STACK)) found.push(match[1].trim());
  return found;
}

/** Colour literals outside token sources: the measure of token bypass. */
export function countLooseColors(surfaceFiles, tokenPaths, readFile) {
  const loose = [];
  for (const relative of surfaceFiles) {
    if (tokenPaths.includes(relative)) continue;
    let text;
    try {
      text = readFile(relative);
    } catch {
      continue;
    }
    const count = (text.match(HEX) ?? []).length;
    if (count > 0) loose.push({ path: relative, count });
  }
  return loose.sort((a, b) => b.count - a.count);
}

/**
 * @returns {{
 *   tokenFiles: Array<{path: string, tokenCount: number, themes: string[]}>,
 *   groups: Array<{role: string, count: number, examples: string[]}>,
 *   fonts: Array<{token: string|null, stack: string}>,
 *   themes: string[],
 *   looseColors: Array<{path: string, count: number}>,
 *   looseColorTotal: number,
 * }}
 */
export function measureVisual(surfaceFiles, readFile) {
  const tokenSources = findTokenFiles(surfaceFiles, readFile);
  const tokenPaths = tokenSources.map((source) => source.path);

  const allTokens = tokenSources.flatMap((source) => source.tokens);
  const groups = groupTokens(allTokens);

  // Font tokens first (they carry a name), then any stack declared elsewhere.
  const fonts = [];
  for (const source of tokenSources) {
    for (const token of source.tokens) {
      if (/-font-[a-z]+$/i.test(token.name) && /,|"/.test(token.value)) {
        fonts.push({ token: token.name, stack: token.value });
      }
    }
  }
  if (fonts.length === 0) {
    for (const source of tokenSources) {
      for (const stack of source.fonts) fonts.push({ token: null, stack });
    }
  }

  const themes = [...new Set(tokenSources.flatMap((source) => source.themes))];
  const looseColors = countLooseColors(surfaceFiles, tokenPaths, readFile);

  return {
    tokenFiles: tokenSources.map((source) => ({ path: source.path, tokenCount: source.tokens.length, themes: source.themes })),
    groups,
    fonts: fonts.slice(0, 6),
    themes,
    looseColors: looseColors.slice(0, 6),
    looseColorTotal: looseColors.reduce((sum, entry) => sum + entry.count, 0),
  };
}

// Generate one auditable spec file per section from the captured extraction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const detail = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/research/detail-desktop.json'), 'utf8'));
const css = fs.readFileSync(path.join(ROOT, 'landing/assets/css/reference-0.css'), 'utf8');
const OUT = path.join(ROOT, 'docs/research/components');

const DESCRIPTIONS = {
  nav: ['sticky translucent bar; brand + links + icon buttons + download', 'sticky (top:0, z-index:10), backdrop blur, border appears on scroll'],
  hero: ['two-column hero: headline/lede/chips/CTAs vs. product screenshot', 'static grid'],
  sponsor: ['centered sponsor logo cards', 'hover lifts card + arrow'],
  agents: ['centered logo grids for supported agents and models', 'static'],
  how: ['eyebrow + heading + sub + three-card gateway flow with arrows', 'static'],
  masking: ['eyebrow + heading + sub + dashboard image + 6-cell bordered feature grid', 'static'],
  subscriptions: ['eyebrow + heading + sub + three subscription cards', 'static'],
  routing: ['eyebrow + heading + sub + interactive routing demo + 4-point grid', 'click-driven: 5 tabs switch active strategy and animated diagram'],
  providers: ['eyebrow + heading + sub + provider screenshot', 'static'],
  features: ['eyebrow + heading + 6-cell bordered feature grid', 'static'],
  cli: ['eyebrow + heading + sub + copyable install command + CLI transcript', 'click-driven copy button'],
  final: ['centered bird + heading + sub + CTAs + channel pills + platform cards', 'click-driven channel pills switch download links'],
  footer: ['three-part footer: copyright, disclaimer, links', 'link hover'],
};

for (const [name, data] of Object.entries(detail)) {
  const [overview, interaction] = DESCRIPTIONS[name] || ['section', 'static'];
  const rules = css.split('\n').filter(l => {
    const re = name === 'nav' ? /^(nav|nav\.|\.brand|nav )/ :
      new RegExp('^(\\.' + name + '|' + name + ' |#' + name + '|\\.rt|\\.grid|\\.subs|\\.plats|\\.chan|\\.flow|\\.col|\\.hub|\\.install|\\.copy|\\.chip|\\.chips|\\.wide|\\.final|\\.agents|\\.sponsor|\\.community|section|h2|\\.eyebrow|\\.sub|\\.split|\\.arrow|\\.btn|\\.meta)');
    return re.test(l.trim());
  }).slice(0, 60).join('\n');
  const spec = `# ${name[0].toUpperCase() + name.slice(1)} Section Specification

## Overview
- **Target file:** \`landing/index.html\` (section \`<${name === 'footer' ? 'footer' : 'section'}|div|nav}>\`)
- **Screenshot:** \`docs/design-references/sections/magpie-${name}.png\`
- **Interaction model:** ${interaction}
- **Measured box (1440px):** ${data.rect.w} × ${data.rect.h}px
- **Purpose:** ${overview}

## Computed Styles (exact, from getComputedStyle at 1440px)
\`\`\`json
${JSON.stringify(data.selfStyle, null, 2)}
\`\`\`

## Relevant CSS Rules (verbatim from captured stylesheet)
\`\`\`css
${rules || '(see landing/assets/css/reference-0.css)'}
\`\`\`

## DOM Structure
\`\`\`
${JSON.stringify(data.tree, null, 2).slice(0, 8000)}
\`\`\`

## Verbatim Text Content
${data.text.replace(/\n/g, '\n').slice(0, 6000)}

## Assets
- All images resolve to \`landing/assets/media/img/*\` and \`landing/assets/media/icons/*\`.
- Light/dark pairs use \`<picture>\` with \`.for-light\` / \`.for-dark\` \`source\` classes.

## States and Behaviors
- **Default (light):** \`:root\` tokens \`--bg:#fafafa; --ink:#111112; --ink2:#4a4a50; --ink3:#85858c; --line:#e4e4e7; --card:#ffffff\`.
- **Dark:** \`:root[data-theme="dark"]\` overrides tokens; bird images are inverted; dark image variants swap in.
- **Responsive:** \`<=860px\` collapses nav links into a menu and stacks hero/split/flow; \`<=560px\` single-column grids and tightened type; \`<=360px\` hides the nav download button.

## Verification
- Visual: compare \`docs/design-references/sections/magpie-${name}.png\` against the rendered local section at 1440px.
`;
  fs.writeFileSync(path.join(OUT, `${name}.spec.md`), spec);
}
console.log('wrote', Object.keys(detail).length, 'spec files');

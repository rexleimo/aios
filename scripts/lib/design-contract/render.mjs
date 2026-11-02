// Renders a project's motion contract from measured facts plus the universal
// rules, leaving every genuine decision visibly unanswered.
//
// The shape matters more than the prose. A generated contract that reads well
// but names no surface, no page and no command is the failure this replaces: it
// looks like governance and enforces nothing. So the renderer emits:
//
//   - a scope section built from files it actually saw,
//   - the universal rules verbatim (never paraphrased - a paraphrase is a fork),
//   - a verification section whose commands are copied from the facts,
//   - a decisions section that lists what was measured and refuses to decide
//     what only a person can decide.
//
// TODO(decision) markers are output on purpose. A generator that silently picks
// a palette or a curve hands the project a rule nobody chose; one that leaves a
// marked blank makes the missing decision impossible to miss, and validate.mjs
// fails while any remain.

import { extractSections, missingSections, REQUIRED_INSTANCE_SECTIONS } from './rules.mjs';

const TODO = 'TODO(decision)';

function listOrNone(items, render, none = '_none_') {
  return items.length ? items.map(render).join('\n') : none;
}

function scopeSection(facts) {
  const surfaces = facts.surfaces.slice(0, 24);
  const more = facts.surfaces.length - surfaces.length;
  const framework = facts.framework.frameworks.length
    ? facts.framework.frameworks.join(', ')
    : 'none detected (plain CSS/HTML)';
  return `## 适用范围

**覆盖**：本契约约束下列 ${facts.surfaces.length} 个界面源文件（由 \`git ls-files\` 实测，非举例）。框架：${framework}。

${listOrNone(surfaces, (file) => `- \`${file}\``)}${more > 0 ? `\n- …另有 ${more} 个，见 \`node scripts/design.mjs facts --json\`` : ''}

**生成物与依赖不在范围内**（判它们等于把历史快照算成技术债）：

${listOrNone(facts.excluded, (entry) => `- ${entry.why}：${entry.count} 个文件`)}`;
}

function universalSection(universal) {
  // Verbatim. The universal rules are the shared owner; quoting them with edits
  // would create a second owner that looks like the first.
  return universal.trim();
}

function verificationSection(facts) {
  const pages = facts.surfaces.filter((file) => /\.(html?|astro|vue|svelte)$/i.test(file));
  const example = pages[0] ?? facts.surfaces[0] ?? '<no surface found>';
  return `## 验证

**声明级（可机器判定）**：

\`\`\`bash
node scripts/check-motion-contract.mjs --root .
\`\`\`

判的是时长上限、\`transition: all\`、\`infinite\` 是否有 reduced-motion 兜底、有动效但无兜底。
实测现状：扫描 ${facts.motion.scanned} 个文件，时长出现最多的 ${facts.motion.durations[0]?.ms ?? 0}ms，
${facts.motion.withoutReducedMotion.length} 个文件有动效但没有 \`prefers-reduced-motion\` 块。

**帧级（可执行，不用等人工）**：

\`\`\`bash
node scripts/check-motion-frame.mjs --page <你要改的那个页面>
\`\`\`

${TODO}：从下面这些文件里挑出真正会动的那个，把 \`--page\` 写成它的路径（现在示例用的是 \`${example}\`）：

${listOrNone(pages.slice(0, 8), (file) => `- \`${file}\``)}

**人工（审美判断）**：改动动效面时附上固定间隔 ≥8 帧、60ms 接缝采样、390px 宽度、减少动效模式四类证据之一。

${TODO}：确认本项目的帧级门是否有可用浏览器；没有时它会 exit 3 打印 SKIP，**SKIP 不是 PASS**，不得声称验过。`;
}

function decisionsSection(facts) {
  const durations = facts.motion.durations;
  const easings = facts.motion.easings;
  return `## 决策记录

本节记的是**「通用判据留了选择余地、必须由这个项目自己定」**的那些点。每条要写：决定 + 理由 + 被拒的选项。

### 已实测，需确认而非发明

- 时长分布（出现次数）：${durations.length ? durations.map((d) => `${d.ms}ms×${d.count}`).join('、') : '未测到'}
- 缓动曲线：${easings.length ? easings.map((e) => `\`${e.curve}\`×${e.count}`).join('、') : '未测到'}
- 缺 reduced-motion 兜底的文件：${facts.motion.withoutReducedMotion.length} 个

${TODO}：上面的分布是现状还是目标？若现状就含缺陷（例如 2s 的无限循环），写清哪些保留、哪些要改。

### 待决

- ${TODO}：**曲线分族** —— 通用判据要求位移与到场用两族不同曲线。本项目具体用哪两条？
- ${TODO}：**演示层边界** —— 哪些页面允许占位条/裁切出血/10–16 秒循环？哪些是产品页、一律不允许？
- ${TODO}：**非 UI 树的排除** —— 生成物、第三方示例、按帧渲染的视频是否排除？排除的理由要写在这里，不能只写在脚本里。`;
}

/**
 * @param {{facts: object, universal: string}} input
 * @returns {string} the instance document. May still contain TODO(decision).
 */
export function renderContract({ facts, universal }) {
  const header = `# MOTION.md — 动效契约

本文件是**动效判据的唯一 owner**。\`DESIGN.md\` 管视觉语言（配色、字体、间距、组件形态），本文件管**时间轴上的事实**：时长、曲线、进出场顺序、循环接缝、光标因果、减动效覆盖。两者不互相顶替。

> 本文件分为两半：**通用判据**由 AIOS 统一下发（改了会影响所有采用它的项目），**实例部分**（适用范围/验证/决策记录）由 \`node scripts/design.mjs init\` 从本项目实测生成，由本项目自己维护。中间那段规则不允许就地改写——那会造成第二个 owner。`;

  return [
    header,
    scopeSection(facts),
    universalSection(universal),
    verificationSection(facts),
    decisionsSection(facts),
  ].join('\n\n') + '\n';
}

/**
 * Structural self-check on a rendered document, before it is written. Reports
 * what the caller must resolve; it does not resolve anything.
 */
export function inspectRendered(text) {
  return {
    sections: extractSections(text),
    missingSections: missingSections(text, REQUIRED_INSTANCE_SECTIONS),
  };
}

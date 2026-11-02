// Renders a project's DESIGN.md from measured visual facts, leaving the
// decisions a person has to make visibly open.
//
// The split is the same as the motion contract's, and for the same reason: the
// structure is shared (config/design-contract/DESIGN-STRUCTURE.md), the evidence
// is measured, and the choices are marked TODO(decision) rather than guessed. A
// generator that picked a palette would be authoring a brand nobody approved,
// which is worse than an obvious blank.
//
// One thing this renderer does that the motion one does not: it reports
// contradictions between the measured evidence and the rules the project
// claims to follow. A design document that states a rule the tokens disprove is
// not a document, it is a wish.

const TODO = 'TODO(decision)';

function table(rows, header) {
  if (!rows.length) return '_none measured_';
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function scopeLines(facts) {
  const framework = facts.framework.frameworks.length ? facts.framework.frameworks.join(', ') : 'none detected (plain CSS/HTML)';
  return `本契约约束下列 ${facts.surfaces.length} 个界面源文件（实测）。框架：${framework}。`;
}

function evidenceSection(facts) {
  const visual = facts.visual;
  const tokenRows = visual.tokenFiles.map((file) => [`\`${file.path}\``, String(file.tokenCount), file.themes.length ? 'yes' : 'no']);
  const groupRows = visual.groups.slice(0, 8).map((group) => [group.role, String(group.count), group.examples[0] ? `\`${group.examples[0]}\`` : '—']);
  const fontRows = visual.fonts.map((font) => [font.token ? `\`${font.token}\`` : '_inline_', `\`${font.stack}\``]);

  return `## Evidence Snapshot

实测事实，不是形容词。每条都能在仓库里指回具体文件。

${table(tokenRows, ['token source', 'tokens', 'themes'])}

**Token 按角色分布**：

${table(groupRows, ['role', 'count', 'example'])}

**字体族**：

${table(fontRows, ['token', 'stack'])}

**主题块**（${visual.themes.length} 个）：${visual.themes.length ? visual.themes.map((t) => `\`${t}\``).join('、') : '_未测到_'}

**未走 token 的颜色**：${visual.looseColorTotal} 处${visual.looseColors.length ? `，集中在 ${visual.looseColors.map((entry) => `\`${entry.path}\`(${entry.count})`).join('、')}` : ''}。

${TODO}：上面这项是「已知债」还是「刻意」？一个页面里 42 处硬编码颜色与 194 个 token 并存，通常意味着 token 没被当成约束用。写清哪些要收编、哪些保留，否则下一代组件会继续复制字面量。`;
}

function gapSection(facts) {
  const visual = facts.visual;
  const hasSpacing = visual.groups.some((group) => /space|gap/i.test(group.role));
  const hasRadius = visual.groups.some((group) => /radius/i.test(group.role));
  const hasType = visual.fonts.length > 0;
  const missing = [];
  if (!hasSpacing) missing.push('间距');
  if (!hasRadius) missing.push('圆角');
  if (!hasType) missing.push('字体');

  const contrast = `对比度、焦点可见性、文本缩放、减少动效`;
  return `## Accessibility Baseline

${contrast}四项必须写成可被 reviewer 检验的承诺，不是意图。

${TODO}：本项目当前的实际值是多少？（正文对比度目标、焦点环样式、最小可点面积、减少动效下的替代表现）没有实测前不要写「符合 WCAG」——那是结论，不是承诺。

${missing.length ? `**未测到的角色**：${missing.join('、')}。缺 token 不等于没有规则，可能只是写在组件里；先确认再补。` : '**角色覆盖**：间距、圆角、字体均有 token。'}`;
}

function contradictionSection(facts) {
  const items = [];
  // A rule stated in prose and contradicted by the tokens is the finding worth
  // surfacing: it is invisible to any single-file check, and readers trust the
  // prose over the evidence.
  const { visual, motion } = facts;
  if (visual.tokenFiles.length > 0 && visual.looseColorTotal > 0) {
    items.push(`- token 已建立（${visual.tokenFiles.reduce((sum, file) => sum + file.tokenCount, 0)} 个）但仍有 ${visual.looseColorTotal} 处颜色字面量绕过它们。`);
  }
  if (motion.easings.length === 1 && motion.durations.length > 2) {
    items.push(`- 动效曲线只有 1 种（\`${motion.easings[0].curve}\`），而时长有 ${motion.durations.length} 档。单一曲线铺满全站会把层级压平——这是 MOTION.md 明令禁止的形状。`);
  }
  if (motion.withoutReducedMotion.length > 0) {
    items.push(`- ${motion.withoutReducedMotion.length} 个文件有动效但没有 \`prefers-reduced-motion\` 块。`);
  }

  return `## 规则与证据的矛盾（自动检出）

${items.length ? items.join('\n') : '_未检出矛盾。_'}

${items.length ? `${TODO}：每条矛盾要么改证据（收编字面量、补曲线、补兜底），要么改规则（删掉不打算执行的条款）。**不要两条都留着**——被证据反驳的规则会让整份文档失去可信度。` : ''}`;
}

function decisionsSection(facts) {
  const accent = facts.visual.groups.find((group) => /cyan|blue|accent|primary|brand/i.test(group.role));
  return `## 决策记录

通用结构留了选择余地、必须由本项目自己定的点。每条写：决定 + 理由 + 被拒的选项。

- ${TODO}：**Mode** —— **Restyle**（保留信息架构，只改视觉）还是 **Reference**（沿用某个已知产品的语言）？两者的自由度不同，写错会导致后面的所有判断都错位。
- ${TODO}：**主色承担什么语义** ——${accent ? `实测到 \`${accent.role}\` 类 token ${accent.count} 个，` : ''}它们之间谁表示「可操作」、谁表示「已选中」、谁只做装饰？混用会让用户无法从颜色读出状态。
- ${TODO}：**演示层与产品层的边界** —— 哪些页面允许占位条/裁切出血/循环动画？哪些一律不允许？
- ${TODO}：**被拒的视觉方向** —— 至少写一条你考虑过但没有采用的，以及否决理由。只写最终方案的决策记录无法被复查。`;
}

/**
 * @param {{facts: object, structure?: string|null}} input
 * @returns {string} the instance document. May still contain TODO(decision).
 */
export function renderDesign({ facts }) {
  const header = `# DESIGN.md — 视觉契约

本文件是**本仓库**视觉语言的 owner：配色、字体、间距、组件形态。时间轴上的事实（时长、曲线、进出场、循环接缝、减动效）在 \`MOTION.md\`，两个 owner 分离是刻意的。

> 结构由 \`config/design-contract/DESIGN-STRUCTURE.md\` 统一下发（改了只影响结构，不影响任何项目的配色）；证据由 \`node scripts/design.mjs init\` 实测填入；决策留 \`TODO(decision)\` 由本项目填写，\`node scripts/design.mjs check\` 拒绝未决项。`.replace('TODO(decision)', '待决标记');

  const mode = `## Mode

${TODO}：选定并说明理由。

- \`Restyle\` —— 保留信息架构与内容，只更新视觉语言。适合已有可用产品、只想换皮。
- \`Reference\` —— 沿用某个已知产品的视觉语言（须写明是哪一个、哪一天对照的）。适合新项目起步。

本项目实际是：${facts.framework.frameworks.length ? `\`${facts.framework.frameworks.join('`, `')}\` 技术栈` : '纯 CSS/HTML'}，${facts.surfaces.length} 个界面源文件。`;

  return [header, scopeSection(facts), mode, assumptionsSection(facts), evidenceSection(facts), visualSystemSection(facts), gapSection(facts), contradictionSection(facts), decisionsSection(facts)].join('\n\n') + '\n';
}

/**
 * Evidence Snapshot says what was counted; this says what the product uses. They
 * are not the same section: a project can hold 194 tokens and still have no rule
 * for elevation, and only a role-by-role statement makes that visible.
 */
function visualSystemSection(facts) {
  const groups = facts.visual.groups;
  const ROLES = ['bg', 'text', 'accent', 'elev', 'shadow', 'panel', 'space', 'radius', 'font', 'border'];
  const rows = ROLES.map((role) => {
    const group = groups.find((entry) => entry.role === role);
    return group ? [role, String(group.count), `\`${group.examples[0]}\``] : [role, '_no token_', '-'];
  });

  return `## Visual System

按角色分组，每行指回一个真实 token。标「无 token」的角色不是没有样式，是样式散在组件里——那是下一步要收编的对象，不是已经完成的状态。

${table(rows, ['role', 'count', 'example'])}

${TODO}：上表里哪些角色**允许**继续没有 token（例如一次性布局值），哪些**必须**补？补进 token 文件，不要继续在组件里写字面量。`;
}

function scopeSection(facts) {
  const listed = facts.surfaces.slice(0, 16);
  const more = facts.surfaces.length - listed.length;
  return `## 适用范围

${scopeLines(facts)}

${listed.map((file) => `- \`${file}\``).join('\n')}${more > 0 ? `\n- …另有 ${more} 个，见 \`node scripts/design.mjs facts --json\`` : ''}

**不在范围内**（实测排除，每项都有理由）：

${facts.excluded.length ? facts.excluded.map((entry) => `- ${entry.why}：${entry.count} 个文件`).join('\n') : '_无_'}`;
}

function assumptionsSection() {
  return `## Assumptions

以下是在没有用户明示的情况下做出的假设，写成假设而不是需求——写错了容易被纠正，被吸收进「视觉系统」里就只能重写。

- ${TODO}：**Goal** —— 这个界面解决什么问题？一句话，不含形容词。
- ${TODO}：**Primary user** —— 谁在用、在什么状态下用？
- ${TODO}：**Platform** —— 桌面优先还是移动优先？最小宽度？
- ${TODO}：**Scope** —— 本文件只管哪些路径？超出这个范围的要另立契约。`;
}

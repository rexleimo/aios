// Splits a motion contract into the two things it is made of, and checks that
// they have not drifted apart.
//
// The problem this solves: a contract shipped with a product has to be editable
// by that product and also kept in step with the rules it inherits. Copying the
// rules into every project makes them drift; keeping only the source means a
// project cannot state its own scope. So the rules live once (UNIVERSAL.md) and
// every project instance restates them verbatim.
//
// Two copies that must agree is a chore unless something checks. That is this
// file: given an instance and the universal source, it reports rules only in
// one of them. A project that deletes a rule it dislikes, or adds one it wants,
// is visible instead of silent.
//
// Nothing here renders or measures. It compares text, because a rule is a
// sentence a person reads - the executable half of the contract is
// check-motion-contract.mjs and check-motion-frame.mjs.

import fs from 'node:fs';
import path from 'node:path';

const NEWLINE = /\r?\n/;

/**
 * A rule is one bullet whose lead-in is bold AND which then continues into a
 * statement: `- **Two curves, by role**: ...`. Requiring the separator matters -
 * a bold lead-in alone also matches inventory bullets such as
 * `- **kit/ 96 files**: ...` and the frame-gate findings list, and counting
 * those as rules makes every contract look drifted.
 */
const RULE = /^\s*-\s+\*\*[^*]+\*\*/;

const SECTION = /^##\s+(.+?)\s*$/;

/**
 * Only the sections that carry rules take part in the comparison. A contract
 * also contains verification steps and provenance notes written as bullets;
 * comparing those against a rule set produces false drift, and a check that
 * cries wolf is one people learn to skip.
 */
const RULE_SECTIONS = Object.freeze([
  '判据分层（先看这一节）',
  '时长与曲线',
  '出现、移动、离开',
  '循环',
  '变化中的文字与数值',
  '光标与指针交互',
  '滚动与镜头',
  '减少动效（硬性）',
]);

/** Rules inside the sections that own them, ignoring every other bullet. */
export function extractRuleSections(text) {
  const out = [];
  let active = false;
  for (const line of String(text).split(NEWLINE)) {
    const section = SECTION.exec(line);
    if (section) {
      active = RULE_SECTIONS.includes(section[1]);
      continue;
    }
    if (active && RULE.test(line)) out.push(line.replace(/^\s*-\s+/, '- ').trimEnd());
  }
  return out;
}

export function extractRules(text) {
  return extractRuleSections(text);
}

export function extractSections(text) {
  const found = [];
  for (const line of String(text).split(NEWLINE)) {
    const match = SECTION.exec(line);
    if (match) found.push(match[1]);
  }
  return found;
}

// A rule's identity is its whole sentence. Comparing only the bold lead-in
// would let a rule keep its heading while losing its substance, which is the
// drift most likely to happen: an editor rewrites the explanation and leaves
// the title alone.
function keyOf(rule) {
  return rule.replace(/\s+/g, ' ').trim();
}

export function compareRuleSets({ universal, instance }) {
  const universalRules = extractRules(universal);
  const instanceRules = extractRules(instance);
  const universalKeys = new Map(universalRules.map((rule) => [keyOf(rule), rule]));
  const instanceKeys = new Map(instanceRules.map((rule) => [keyOf(rule), rule]));

  const missingFromInstance = [...universalKeys.keys()].filter((key) => !instanceKeys.has(key));
  const notInUniversal = [...instanceKeys.keys()].filter((key) => !universalKeys.has(key));

  return {
    ok: missingFromInstance.length === 0 && notInUniversal.length === 0,
    universalCount: universalKeys.size,
    instanceCount: instanceKeys.size,
    missingFromInstance,
    notInUniversal,
  };
}

export function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** The universal source shipped with this installation. */
export function universalPath(rootDir) {
  // Shipped as data, not as a skill: a directory under skill-sources/ without a
  // SKILL.md is rejected by the client skill registry, and this is a template the
  // generator reads rather than something an agent loads.
  return path.join(rootDir, 'config', 'design-contract', 'UNIVERSAL.md');
}

/**
 * Sections an instance must answer, so a generated file cannot be shaped like a
 * contract while leaving the project-specific half empty. Each entry is what the
 * reader needs to know, not a heading to copy blindly.
 */
export const REQUIRED_INSTANCE_SECTIONS = Object.freeze([
  { heading: '适用范围', why: 'which surfaces are in scope, and which generated or non-UI trees are excluded' },
  { heading: '验证', why: 'the exact commands this project runs, with its own page paths' },
  { heading: '决策记录', why: 'the choices this project made where the universal rules leave a choice' },
]);

export function missingSections(text) {
  const sections = extractSections(text);
  return REQUIRED_INSTANCE_SECTIONS.filter((entry) => !sections.includes(entry.heading)).map((entry) => entry.heading);
}

/** Placeholders a generated instance must have resolved before it ships. */
/** Placeholders a generated instance must have resolved before it ships. */
export function unresolvedPlaceholders(text) {
  const found = new Set();
  const body = String(text);
  for (const match of body.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g)) found.add(match[1]);
  // These documents are written in Chinese, so the colon after the marker may be
  // ASCII or fullwidth. A pattern that only knows `:` reports zero unresolved
  // decisions on a document full of them, which is the worst possible answer.
  const marker = 'TODO(decision)';
  for (const line of body.split(/\r?\n/)) {
    const at = line.indexOf(marker);
    if (at === -1) continue;
    found.add(line.slice(at).trim());
  }
  return [...found];
}

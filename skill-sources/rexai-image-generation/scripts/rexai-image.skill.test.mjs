import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
const skillText = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const frontmatter = skillText.match(/^---\n([\s\S]*?)\n---/);

assert.ok(frontmatter, 'SKILL.md must have YAML frontmatter');

const fields = Object.fromEntries(frontmatter[1].split(/\r?\n/).map(line => {
  const separator = line.indexOf(':');
  return [line.slice(0, separator), line.slice(separator + 1).trim()];
}));

assert.equal(fields.name, 'rexai-image-generation');
assert.ok(fields.description.startsWith('Use when '), 'description must be trigger-only and start with "Use when"');
assert.ok(fields.description.length <= 1024, 'description must stay within Codex frontmatter budget');
assert.doesNotMatch(fields.description, /submit|poll|download/i, 'description should not summarize workflow steps');

for (const trigger of [
  'generate an image',
  'edit an image',
  'text-to-image',
  'image-to-image',
  '\u751f\u56fe',
  '\u6587\u751f\u56fe',
  '\u56fe\u751f\u56fe'
]) {
  assert.ok(fields.description.includes(trigger), `description missing trigger: ${trigger}`);
}

assert.ok(skillText.includes('Linux bash persistent setup'), 'API key setup should include Linux bash persistence');
assert.ok(skillText.includes(">> ~/.bashrc"), 'API key setup should show ~/.bashrc persistence');

console.log('rexai-image skill tests passed');

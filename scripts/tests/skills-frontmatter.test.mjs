import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function listSkillMarkdownFiles(rootDir) {
  const results = [];

  async function walk(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(absPath);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}

function extractFrontmatter(content, filePath) {
  assert.equal(content.startsWith('---\n'), true, `${filePath} must start with YAML frontmatter`);
  const end = content.indexOf('\n---\n', 4);
  assert.notEqual(end, -1, `${filePath} must close YAML frontmatter`);
  return content.slice(4, end);
}

function assertPlainScalarsAreYamlSafe(frontmatter, filePath) {
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s+(.+)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    const quoted = value.startsWith('"') || value.startsWith("'");
    assert.equal(
      !quoted && value.includes(': '),
      false,
      `${filePath} frontmatter ${key} contains ": " and must be quoted for strict YAML parsers`
    );
  }
}

test('canonical skill frontmatter is safe for strict YAML parsers', async () => {
  const rootDir = path.join(process.cwd(), 'skill-sources');
  const skillFiles = await listSkillMarkdownFiles(rootDir);

  assert.ok(skillFiles.length > 0, 'expected canonical skill sources');
  for (const filePath of skillFiles) {
    assertPlainScalarsAreYamlSafe(await extractFrontmatter(await readFile(filePath, 'utf8'), filePath), filePath);
  }
});

test('pre-edit safety gate prepares a current, reusable development environment without blocking normal refactors', async () => {
  const skillPath = path.join(process.cwd(), 'skill-sources', 'pre-edit-safety-gate', 'SKILL.md');
  const content = await readFile(skillPath, 'utf8');

  assert.match(content, /git pull --ff-only/);
  assert.match(content, /CRG.*(更新|update)|(?:更新|update).*CRG/i);
  assert.match(content, /抽象/);
  assert.match(content, /封装/);
  assert.match(content, /解耦/);
  assert.match(content, /目录/);
  assert.doesNotMatch(content, /Wait for user approval/);
  assert.match(content, /rather than after every edit/);
  assert.doesNotMatch(content, /Run tests after every code change/);
});

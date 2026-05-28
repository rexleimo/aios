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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '../src');
const cjk = /[\u3400-\u9fff]/u;
const EXCLUDED_DIR = path.join(srcDir, 'i18n');

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (file !== EXCLUDED_DIR) yield* sourceFiles(file);
    } else if (/\.(tsx?|jsx?|mjs)$/u.test(entry.name)) {
      yield file;
    }
  }
}

function isTranslationKey(node) {
  const parent = node.parent;
  return !!parent && ts.isCallExpression(parent)
    && ts.isIdentifier(parent.expression)
    && (parent.expression.text === 't' || parent.expression.text === 'translate')
    && parent.arguments.includes(node);
}

function untranslatedLiterals(file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const hits = [];
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (cjk.test(node.text) && !isTranslationKey(node)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        hits.push(`${path.relative(srcDir, file)}:${line}: ${node.text.slice(0, 80)}`);
      }
    } else if (ts.isJsxText(node) && cjk.test(node.text)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      hits.push(`${path.relative(srcDir, file)}:${line}: ${node.text.trim().slice(0, 80)}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

test('no UI-authored source-language literal remains outside catalog keys', () => {
  const hits = [];
  for (const file of sourceFiles(srcDir)) hits.push(...untranslatedLiterals(file));
  assert.deepEqual(hits, [], `untranslated literals:\n${hits.join('\n')}`);
});

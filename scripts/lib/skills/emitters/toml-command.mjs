// toml-command.mjs — converts SKILL.md (YAML frontmatter + markdown body) to Gemini CLI command TOML.
// Gemini CLI reads .gemini/commands/*.toml with a `prompt` field; SKILL.md placed in .gemini/skills/ is invisible.
// This emitter replaces the directory-copy sync path for clients with skillFormat: 'toml-command'.

import fs from 'node:fs';
import path from 'node:path';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;

// Machine-parseable marker comment embedded as first line of generated TOML files.
// Format: # AIOS-MANAGED <json-payload>
const MANAGED_MARKER_PREFIX = '# AIOS-MANAGED ';
const MANAGED_MARKER_RE = /^# AIOS-MANAGED (.+)$/;

function buildManagedMarker(metadata) {
  return `${MANAGED_MARKER_PREFIX}${JSON.stringify(metadata)}`;
}

export function parseManagedMarker(firstLine) {
  const match = String(firstLine || '').match(MANAGED_MARKER_RE);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function isManagedTomlCommand(filePath) {
  try {
    const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
    return parseManagedMarker(firstLine) !== null;
  } catch {
    return false;
  }
}

function parseSimpleYaml(text) {
  const fields = Object.create(null);
  if (!text) return fields;
  for (const line of text.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.startsWith('[') || value.startsWith('{') || value.startsWith('|') || value.startsWith('>')) continue;
    if (key) fields[key] = value;
  }
  return fields;
}

function escapeTomlMultilineString(value) {
  if (value.includes("'''")) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    return `"""\n${escaped}\n"""`;
  }
  if (value.includes('"""')) {
    return `'''\n${value}\n'''`;
  }
  return `'''\n${value}\n'''`;
}

function toTomlKeyValue(key, value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${key} = "${escaped}"`;
}

/**
 * Convert a SKILL.md materialized directory into a Gemini CLI TOML command string.
 * @param {string} skillDir - path to the materialized skill directory (contains SKILL.md)
 * @param {object} metadata - sync metadata ({relativeSkillPath, targetSurface, ...})
 * @returns {{ toml: string, name: string }} TOML content and metadata
 */
export function convertSkillToTomlCommand(skillDir, metadata = {}) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found in materialized skill dir: ${skillDir}`);
  }

  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const fmMatch = raw.match(FRONTMATTER_RE);
  const frontmatter = fmMatch ? parseSimpleYaml(fmMatch[1]) : Object.create(null);
  const body = fmMatch ? raw.slice(fmMatch[0].length).trim() : raw.trim();

  const name = frontmatter.name || path.basename(skillDir);
  const description = frontmatter.description || '';

  const markerMeta = {
    skill: metadata.relativeSkillPath || name,
    surface: metadata.targetSurface || '',
    generated: new Date().toISOString().slice(0, 10),
  };

  const lines = [];
  lines.push(buildManagedMarker(markerMeta));
  lines.push('');
  lines.push(toTomlKeyValue('name', name));
  if (description) {
    lines.push(toTomlKeyValue('description', description));
  }
  lines.push(`prompt = ${escapeTomlMultilineString(body)}`);
  lines.push('');

  return {
    toml: lines.join('\n'),
    name,
  };
}

/**
 * Write a TOML command file and write metadata to a companion file.
 * @param {string} targetPath - absolute path for the .toml file
 * @param {string} tomlContent - TOML content string
 * @param {object} metadata - sync metadata object
 * @param {Function} writeGeneratedMeta - callback to write the meta companion file
 */
export function writeTomlCommandTarget(targetPath, tomlContent, metadata, writeGeneratedMeta) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const oldContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  if (oldContent === tomlContent) {
    if (writeGeneratedMeta) writeGeneratedMeta(targetPath, metadata);
    return false;
  }
  fs.writeFileSync(targetPath, tomlContent, 'utf8');
  if (writeGeneratedMeta) writeGeneratedMeta(targetPath, metadata);
  return true;
}

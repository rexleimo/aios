import { promises as fs } from 'node:fs';
import path from 'node:path';

const AIOS_CONFIG_FILE = 'config.json';
const DEFAULT_MODE_PRESETS = {
  'strict-primary': {
    label: 'Strict AIOS Primary Agent',
    skills: [],
    systemPromptAdditions: [
      'Evaluate the AIOS workflow policy before creating a plan or selecting a skill.',
      'Do not bootstrap a global skill chain; invoke only the policy-selected safety and process gates.',
    ],
  },
  'harness-runner': {
    label: 'Harness Solo Runner',
    skills: ['aios-long-running-harness', 'harness-init-runner'],
    systemPromptAdditions: [
      'You are running inside the AIOS solo harness.',
      'Record progress with aios memo add after each significant change.',
    ],
  },
  'team-worker': {
    label: 'AIOS Team Worker',
    skills: [],
    systemPromptAdditions: [
      'You are running as an AIOS team worker subagent.',
      'Evaluate the AIOS workflow policy for the assigned work item; invoke only the required skills and report a clear handoff note when done.',
    ],
  },
};

/**
 * Read .aios/config.json from the project root.
 */
export async function readAiosConfig(rootDir) {
  const configPath = path.join(rootDir, '.aios', AIOS_CONFIG_FILE);
  let raw;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid .aios/${AIOS_CONFIG_FILE}: ${error.message}`);
  }
}

/**
 * Resolve default_mode from config, with fallback.
 */
export function resolveDefaultMode(config) {
  if (!config) return null;
  const mode = config.default_mode;
  if (!mode) return null;
  if (DEFAULT_MODE_PRESETS[mode]) return mode;
  // Custom mode — read mode_presets from config
  if (config.mode_presets?.[mode]) return mode;
  return null;
}

/**
 * Get the full preset definition for a mode name.
 */
export function getModePreset(modeName, config) {
  if (!modeName) return null;
  // Built-in presets first
  if (DEFAULT_MODE_PRESETS[modeName]) {
    return { ...DEFAULT_MODE_PRESETS[modeName], builtin: true };
  }
  // Custom presets from config
  if (config?.mode_presets?.[modeName]) {
    return { ...config.mode_presets[modeName], builtin: false };
  }
  return null;
}

/**
 * Load the active default_mode and return the skills/systemPromptAdditions to inject.
 * Returns null if no default_mode is configured or if the mode preset doesn't exist.
 */
export async function resolveDefaultModeInjections(rootDir) {
  const config = await readAiosConfig(rootDir);
  const modeName = resolveDefaultMode(config);
  if (!modeName) return null;

  const preset = getModePreset(modeName, config);
  if (!preset) return null;

  return {
    modeName,
    label: preset.label,
    skills: preset.skills || [],
    systemPromptAdditions: preset.systemPromptAdditions || [],
  };
}

/**
 * Write a .aios/config.json with a default_mode and optional custom presets.
 */
export async function writeAiosConfig(rootDir, { defaultMode, presets = {} }) {
  const configPath = path.join(rootDir, '.aios', AIOS_CONFIG_FILE);
  const existing = await readAiosConfig(rootDir) || {};

  const payload = {
    ...existing,
    default_mode: defaultMode || null,
    mode_presets: {
      ...(existing.mode_presets || {}),
      ...presets,
    },
    updatedAt: new Date().toISOString(),
  };

  // Clean up null values
  if (!payload.default_mode) delete payload.default_mode;
  if (Object.keys(payload.mode_presets).length === 0) delete payload.mode_presets;

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

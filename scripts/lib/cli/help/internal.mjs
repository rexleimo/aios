import { getRootHelpText } from './root.mjs';
import { getCodemapHelpText } from './codemap.mjs';

export function getInternalHelpText(target, action) {
  if (target === 'shell' && (action === 'install' || action === 'update')) {
    return `Usage:
  node scripts/aios.mjs internal shell ${action} [--force] [--mode <all|repo-only|opt-in|off>] [--rc-file <path>]
`;
  }

  if (target === 'shell' && action === 'uninstall') {
    return `Usage:
  node scripts/aios.mjs internal shell uninstall [--rc-file <path>]
`;
  }

  if (target === 'shell' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal shell doctor [--rc-file <path>]
`;
  }

  if (target === 'skills' && (action === 'install' || action === 'update')) {
    return `Usage:
  node scripts/aios.mjs internal skills ${action} [--client <all|codex|claude|gemini|opencode|hermes|grok|workbuddy>] [--scope <global|project>] [--install-mode <copy|link>] [--skills <list>] [--force]
`;
  }

  if (target === 'skills' && (action === 'uninstall' || action === 'doctor')) {
    return `Usage:
  node scripts/aios.mjs internal skills ${action} [--client <all|codex|claude|gemini|opencode|hermes|grok|workbuddy>] [--scope <global|project>] [--skills <list>]
`;
  }

  if (target === 'native' && (action === 'install' || action === 'update' || action === 'uninstall')) {
    return `Usage:
  node scripts/aios.mjs internal native ${action} [--client <all|codex|claude|gemini|opencode|hermes|grok|workbuddy>]
`;
  }

  if (target === 'native' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal native doctor [--client <all|codex|claude|gemini|opencode|hermes|grok|workbuddy>] [--verbose] [--fix] [--dry-run]
`;
  }

  if (target === 'native' && action === 'repair') {
    return `Usage:
  node scripts/aios.mjs internal native repair [list|show] [--repair-id <id|latest>] [--limit <n>]
`;
  }

  if (target === 'native' && action === 'rollback') {
    return `Usage:
  node scripts/aios.mjs internal native rollback [--repair-id <id|latest>] [--dry-run]
`;
  }

  if (target === 'browser' && action === 'install') {
    return `Usage:
  node scripts/aios.mjs internal browser install [--dry-run] [--skip-playwright-install]
`;
  }

  if (target === 'browser' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal browser doctor [--fix] [--dry-run]
`;
  }

  if (target === 'browser' && action === 'mcp-migrate') {
    return `Usage:
  node scripts/aios.mjs internal browser mcp-migrate [--dry-run]
`;
  }

  if (target === 'browser' && action === 'cdp-start') {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-start
`;
  }

  if (target === 'browser' && action === 'cdp-stop') {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-stop
`;
  }

  if (target === 'browser' && (action === 'cdp-restart' || action === 'cdp-reload')) {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-restart
`;
  }

  if (target === 'browser' && action === 'cdp-status') {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-status
`;
  }

  if (target === 'privacy' && action === 'install') {
    return `Usage:
  node scripts/aios.mjs internal privacy install [--enable] [--disable] [--mode <regex|ollama|hybrid>]
`;
  }

  if (target === 'codemap') {
    return getCodemapHelpText();
  }

  return getRootHelpText();
}

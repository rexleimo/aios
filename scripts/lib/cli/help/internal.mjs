import { ALL_CLIENTS } from '../../clients/registry.mjs';

/* 中文注释：客户端清单以注册表为准，防止 help 文案随版本漂移。 */
const CLIENTS_FLAG = ['all', ...ALL_CLIENTS].join('|');
import { getRootHelpText } from './root.mjs';
import { getCodemapHelpText } from './codemap.mjs';

export function getInternalHelpText(target, action) {
  if (target === 'shell' && (action === 'install' || action === 'update')) {
    return `Usage:
  aios internal shell ${action} [--force] [--mode <all|repo-only|opt-in|off>] [--rc-file <path>]
`;
  }

  if (target === 'shell' && action === 'uninstall') {
    return `Usage:
  aios internal shell uninstall [--rc-file <path>]
`;
  }

  if (target === 'shell' && action === 'doctor') {
    return `Usage:
  aios internal shell doctor [--rc-file <path>]
`;
  }

  if (target === 'skills' && (action === 'install' || action === 'update')) {
    return `Usage:
  aios internal skills ${action} [--client <${CLIENTS_FLAG}>] [--scope <global|project>] [--project-root <path>] [--install-mode <copy|link>] [--skills <list>] [--force]
`;
  }

  if (target === 'skills' && (action === 'uninstall' || action === 'doctor')) {
    return `Usage:
  aios internal skills ${action} [--client <${CLIENTS_FLAG}>] [--scope <global|project>] [--project-root <path>] [--skills <list>]
`;
  }

  if (target === 'native' && (action === 'install' || action === 'update' || action === 'uninstall')) {
    return `Usage:
  aios internal native ${action} [--client <${CLIENTS_FLAG}>]
`;
  }

  if (target === 'native' && action === 'doctor') {
    return `Usage:
  aios internal native doctor [--client <${CLIENTS_FLAG}>] [--verbose] [--fix] [--dry-run]
`;
  }

  if (target === 'native' && action === 'repair') {
    return `Usage:
  aios internal native repair [list|show] [--repair-id <id|latest>] [--limit <n>]
`;
  }

  if (target === 'native' && action === 'rollback') {
    return `Usage:
  aios internal native rollback [--repair-id <id|latest>] [--dry-run]
`;
  }

  if (target === 'browser' && action === 'install') {
    return `Usage:
  aios internal browser install [--dry-run] [--skip-playwright-install]
`;
  }

  if (target === 'browser' && action === 'doctor') {
    return `Usage:
  aios internal browser doctor [--fix] [--dry-run]
`;
  }

  if (target === 'browser' && action === 'mcp-migrate') {
    return `Usage:
  aios internal browser mcp-migrate [--dry-run]
`;
  }

  if (target === 'browser' && action === 'cdp-start') {
    return `Usage:
  aios internal browser cdp-start
`;
  }

  if (target === 'browser' && action === 'cdp-stop') {
    return `Usage:
  aios internal browser cdp-stop
`;
  }

  if (target === 'browser' && (action === 'cdp-restart' || action === 'cdp-reload')) {
    return `Usage:
  aios internal browser cdp-restart
`;
  }

  if (target === 'browser' && action === 'cdp-status') {
    return `Usage:
  aios internal browser cdp-status
`;
  }

  if (target === 'privacy' && action === 'install') {
    return `Usage:
  aios internal privacy install [--enable] [--disable] [--mode <regex|ollama|hybrid>]
`;
  }

  if (target === 'codemap') {
    return getCodemapHelpText();
  }

  return getRootHelpText();
}

/* 中文注释：浏览器 MCP 配置 facade 保持旧导入稳定；具体职责拆到 snippet/builder/target/migration。 */
export { printSnippet } from './mcp-snippet.mjs';
export { buildAuthToolsMcpServer, buildPreferredMcpServer } from './mcp-server-builders.mjs';
export { collectBrowserMcpMigrationTargets, collectClientMcpTargets } from './mcp-targets.mjs';
export { applyMcpConfigMigration, migrateBrowserMcpConfig, migrateOneMcpJsonFile } from './mcp-migration.mjs';

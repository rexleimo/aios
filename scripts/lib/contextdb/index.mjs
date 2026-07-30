/* 中文注释：ContextDB barrel，集中导出连续性、交接、门面等跨域消费的能力。 */
export {
  extractTouchedFilesFromText,
  readContinuitySummary,
  writeContinuitySummary,
} from './continuity.mjs';

export {
  evaluateHandoffLineage,
  normalizeHandoffPacket,
  readHandoffPacket,
  renderHandoffInjection,
  writeHandoffPacket,
} from './handoff.mjs';

export {
  generateFacadeFromSession,
  loadFacade,
} from './facade.mjs';

export {
  buildExecutionContextPacket,
  evaluateExecutionContextPreflight,
  isExecutionContextMutationDeclared,
  projectContextItems,
  resolveExecutionContextPaths,
  updateExecutionContextExpectedHash,
} from './execution-context.mjs';

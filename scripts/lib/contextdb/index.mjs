/* 中文注释：ContextDB barrel，集中导出连续性、交接、门面等跨域消费的能力。 */
export {
  extractTouchedFilesFromText,
  readContinuitySummary,
  writeContinuitySummary,
} from './continuity.mjs';

export { readHandoffPacket } from './handoff.mjs';

export {
  generateFacadeFromSession,
  loadFacade,
} from './facade.mjs';

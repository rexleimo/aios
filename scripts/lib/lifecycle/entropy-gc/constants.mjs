/* 中文注释：entropy-gc 的事件类型和文件匹配规则集中维护，避免扫描/证据模块重复定义。 */
export const DISPATCH_ARTIFACT_RE = /^dispatch-run-.*\.json$/i;
export const ENTROPY_EVENT_KIND = 'maintenance.entropy-gc';

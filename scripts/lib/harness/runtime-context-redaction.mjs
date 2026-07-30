function redactionTerms(executionContext) {
  return [...new Set((Array.isArray(executionContext?.redactionTexts) ? executionContext.redactionTexts : [])
    .map((value) => String(value || ''))
    .filter((value) => value.length > 0))]
    .sort((left, right) => right.length - left.length);
}

export function redactExecutionContextText(value, executionContext) {
  let output = String(value || '');
  for (const term of redactionTerms(executionContext)) {
    output = output.split(term).join('[REDACTED_ORCHESTRATOR_CONTEXT]');
  }
  return output;
}

export function redactExecutionContextValue(value, executionContext) {
  if (typeof value === 'string') return redactExecutionContextText(value, executionContext);
  if (Array.isArray(value)) return value.map((item) => redactExecutionContextValue(item, executionContext));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    redactExecutionContextValue(item, executionContext),
  ]));
}

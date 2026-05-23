import { renderOrchestrationReportContent } from './report.mjs';
import { buildOrchestrationPlan } from './plan.mjs';

export function renderOrchestrationReport(input = {}) {
  const plan = Array.isArray(input.phases)
    ? input
    : {
      ...buildOrchestrationPlan(input),
      ...(Object.prototype.hasOwnProperty.call(input, 'workItemTelemetry') ? { workItemTelemetry: input.workItemTelemetry } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'dispatchInsights') ? { dispatchInsights: input.dispatchInsights } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'readiness') ? { readiness: input.readiness } : {}),
    };
  return renderOrchestrationReportContent(plan);
}

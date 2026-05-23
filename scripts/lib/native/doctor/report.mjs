export function printNativeReportDetails(report, io, verbose) {
  if (!verbose) {
    return;
  }
  const details = report.details || {};
  const metadataStatus = details.metadataPresent ? 'present' : 'missing';
  const generatedAt = details.metadataGeneratedAt ? ` generatedAt=${details.metadataGeneratedAt}` : '';
  io.log(`[info] native ${report.client} metadata=${details.metadataPath || '(unknown)'} ${metadataStatus}${generatedAt}`);
  io.log(`[info] native ${report.client} managedTargets(expected): ${(details.expectedManagedTargets || []).join(', ') || '(none)'}`);
  if (details.metadataPresent) {
    io.log(`[info] native ${report.client} managedTargets(recorded): ${(details.metadataManagedTargets || []).join(', ') || '(none)'}`);
  }
  io.log(`[info] native ${report.client} operations: ${(details.operationTargets || []).join(', ') || '(none)'}`);
}
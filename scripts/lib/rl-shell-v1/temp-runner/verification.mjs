import { collectFailingTests, computeVerificationStatus, normalizeFailureLabel } from './command.mjs';
import { createDefaultExecutionPolicy } from './policy.mjs';
import { executeAction } from './actions.mjs';

export async function runBaselineFailureCheck({ workspace, verificationCommand, policy = createDefaultExecutionPolicy() }) {
  const verification = await runVerification({ workspace, verificationCommand, policy });
  return {
    reproduced: verification.verification_status !== 'ok' && verification.tests_after.length > 0,
    failingTests: verification.tests_after,
    observation: verification.observation,
    verification_status: verification.verification_status,
  };
}

export async function runVerification({ workspace, verificationCommand, policy = createDefaultExecutionPolicy() }) {
  const observation = await executeAction({
    workspace,
    action: {
      action: 'run',
      command: verificationCommand,
    },
    policy,
  });

  const testsAfter = collectFailingTests(`${observation.payload.stdout_excerpt}\n${observation.payload.stderr_excerpt}`);
  const baselineSet = new Set((workspace.taskManifest?.baseline_failing_tests || []).map(normalizeFailureLabel));
  const newFailures = testsAfter.filter((line) => !baselineSet.has(normalizeFailureLabel(line)));

  const verification = {
    observation,
    tests_after: testsAfter,
    new_failures: newFailures,
    verification_status: computeVerificationStatus(observation),
  };
  workspace.finalVerification = verification;
  return verification;
}

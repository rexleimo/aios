import { validateBrowserEvidence, validateBrowserTask } from './schema.mjs';

import { computeHash } from '../../../src/shared/normalize.mjs';

function buildEvidenceFromScore({ task, score }) {
  const success = score >= 60;
  const boundary = !success && score >= 42;
  const evidence = validateBrowserEvidence({
    page_kind: 'publish-form',
    key_selectors_present: ['[data-form]', task.success_selector],
    form_state: success ? 'submitted' : 'dirty',
    action_taken: 'submit',
    navigation_result: success ? 'success-page' : 'same-page',
    form_error: boundary ? 'title-required' : null,
    auth_state: task.auth_state_class === 'authenticated' ? 'authenticated' : 'unknown',
    challenge_state: 'none',
    sensitive_action_flag: task.sensitive_action_flag,
    terminal_status: success ? 'success' : boundary ? 'validation_error' : 'stalled',
  });

  return {
    evidence,
    boundary,
    terminal_reward: success ? 1 : boundary ? 0 : -1,
    human_handoff_required: false,
    safety_violation: false,
    safety_violation_reason: null,
  };
}

export function createFixtureBrowserDriver(overrides = {}) {
  const driver = {
    calls: [],
    async executeFlow({ task, checkpointId, attempt = 0, mode = 'episode' }) {
      const normalizedTask = validateBrowserTask(task);
      driver.calls.push({
        task_id: normalizedTask.task_id,
        checkpointId,
        attempt,
        mode,
      });
      if (normalizedTask.requireHumanReauth) {
        return {
          evidence: validateBrowserEvidence({
            page_kind: 'auth-wall',
            key_selectors_present: ['form[action="/login"]'],
            form_state: 'locked',
            action_taken: 'submit',
            navigation_result: 'blocked',
            form_error: 'reauth-required',
            auth_state: 'reauth_required',
            challenge_state: 'none',
            sensitive_action_flag: normalizedTask.sensitive_action_flag,
            terminal_status: 'auth_required',
          }),
          boundary: false,
          terminal_reward: -1,
          human_handoff_required: true,
          safety_violation: false,
          safety_violation_reason: null,
        };
      }
      if (normalizedTask.forceChallengeDivergenceTwice && mode === 'comparison') {
        return {
          evidence: validateBrowserEvidence({
            page_kind: 'challenge',
            key_selectors_present: [normalizedTask.challenge_selector],
            form_state: 'locked',
            action_taken: 'submit',
            navigation_result: 'blocked',
            form_error: null,
            auth_state: 'authenticated',
            challenge_state: 'challenge',
            sensitive_action_flag: normalizedTask.sensitive_action_flag,
            terminal_status: 'challenge',
          }),
          boundary: false,
          terminal_reward: -1,
          human_handoff_required: true,
          safety_violation: false,
          safety_violation_reason: null,
        };
      }

      const score = computeHash(`${checkpointId}:${normalizedTask.task_id}:${attempt}:${mode}`) % 100;
      const result = buildEvidenceFromScore({ task: normalizedTask, score });
      if (normalizedTask.sensitive_action_flag && normalizedTask.flow_constraints.length === 0) {
        return {
          ...result,
          safety_violation: true,
          safety_violation_reason: 'unsafe_outbound_action',
        };
      }
      return result;
    },
    ...overrides,
  };
  return driver;
}

export function createBrokenBrowserDriver() {
  return {
    async executeFlow() {
      throw new Error('browser infrastructure unavailable');
    },
  };
}

